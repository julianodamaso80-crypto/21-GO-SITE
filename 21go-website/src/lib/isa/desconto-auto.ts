import 'server-only'
import { atualizarContato, registrarEvento, sql, type ContatoIsa } from '@/lib/isa/banco'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import { planoDoCliente } from '@/lib/isa/abordagem.regras'
import { dentroDoHorario } from '@/lib/isa/hora.regras'
import { ehByd } from '@/lib/isa/entrega.regras'
import { valorDoDescontoAutomatico, mensagemDescontoAutomatico, ESPERA_DESCONTO_MIN } from '@/lib/isa/dono.regras'
import { enviarComoGente } from '@/lib/isa/worker'

/**
 * Desconto automatico na ativacao (dono, 16/09/2026): "qd cliente falar assim vc fala que vai falar
 * com supervisor, espera 6 minutos e volta e fala nao pagar ativacao eu nao consigo, oq eu consegui
 * foi tanto — 70,00 de desconto, se for ativacao acima de 300 pode dar 100,00".
 *
 * O cron da Isa (1 em 1 min) chama isto. Pega quem ouviu "vou falar com o supervisor" ha 6 min ou
 * mais e ainda nao ganhou desconto nenhum. Uma vez so por telefone (desconto50_em): pediu de novo,
 * o worker pausa e avisa o time.
 */
export async function entregarDescontosAutomaticos(): Promise<{ enviados: number; motivo?: string }> {
  if (!dentroDoHorario(new Date())) return { enviados: 0, motivo: 'fora_do_horario' }

  const candidatos = await sql<ContatoIsa>(
    `SELECT c.*
       FROM public.isa_contatos c
       JOIN LATERAL (
         SELECT e.detalhe->>'tipo' AS tipo, e.created_at
           FROM public.isa_eventos e
          WHERE e.telefone = c.telefone AND e.tipo = 'desconto'
          ORDER BY e.created_at DESC LIMIT 1
       ) d ON true
      WHERE d.tipo IN ('perguntou_quando', 'vou_falar')
        AND d.created_at < now() - make_interval(mins => $1)
        AND d.created_at > now() - interval '12 hours'
        AND c.desconto50_em IS NULL
        AND c.ligada
        AND c.transferido_em IS NULL
        -- alguem do time assumiu a conversa depois: a pessoa decide o desconto
        AND (c.humano_em IS NULL OR c.humano_em < d.created_at)
      LIMIT 5`,
    [ESPERA_DESCONTO_MIN],
  )

  let enviados = 0
  for (const c of candidatos) {
    const lead = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
    // Sem simulacao ou BYD (que e da Leticya): nao ha desconto automatico. Marca pra nao voltar.
    if (!lead || ehByd(lead.marca_interesse)) {
      await registrarEvento(c.telefone, 'desconto', { tipo: 'automatico_pulado', motivo: lead ? 'byd' : 'sem_simulacao' })
      continue
    }
    const fatos = fatosDoLead(lead, null, { todosOsPlanos: true })
    const plano = planoDoCliente(fatos.planos, lead.cotacao_plano ?? null)
    const de = plano?.ativacao ?? fatos.ativacaoReferencia
    const valor = de ? valorDoDescontoAutomatico(de) : 0
    if (!de || !valor) {
      await registrarEvento(c.telefone, 'desconto', { tipo: 'automatico_pulado', motivo: 'sem_ativacao', de })
      continue
    }
    const d = { de, para: Math.round((de - valor) * 100) / 100 }

    const enviou = await enviarComoGente(c, mensagemDescontoAutomatico(d), undefined, c.ultimo_inbound_em)
    if (!enviou) {
      await registrarEvento(c.telefone, 'desconto', { tipo: 'automatico_falhou', de: d.de, para: d.para })
      continue
    }
    await atualizarContato(c.telefone, {
      lead_id: lead.id,
      desconto50_em: new Date().toISOString(),
      desconto50_de: d.de,
      desconto50_para: d.para,
      aguardando_dono: null,
    })
    await registrarEvento(c.telefone, 'desconto', { tipo: 'automatico', de: d.de, para: d.para, plano: plano?.nome ?? null })
    enviados++
  }
  return { enviados }
}
