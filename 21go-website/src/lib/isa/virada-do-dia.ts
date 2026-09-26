import 'server-only'
import { registrarEvento, sql, type ContatoIsa } from '@/lib/isa/banco'
import { ehByd } from '@/lib/isa/entrega.regras'
import { cumprimento, dentroDoHorario, horaNoRio } from '@/lib/isa/hora.regras'
import { mensagemViradaDoDia } from '@/lib/isa/dono.regras'
import { enviarComoGente, primeiroNomeDe } from '@/lib/isa/worker'

const POR_RODADA = 5
// Antes disso nao chama ninguem, mesmo com a Isa ja atendendo (7h): e mensagem que ELA puxa.
const A_PARTIR_DAS = 8

/**
 * Virou o dia e a janela de 24 h da Meta ainda esta aberta (dono, 26/09/2026): a Isa chama quem
 * parou de responder ontem — "Bom dia Elton, vai querer dar sequencia na ativacao da sua protecao?".
 * Texto livre, sem template: so dentro da janela, que e quando sai de graca e sem risco.
 *
 * Entra so quem: falou com a Isa ONTEM (no Rio), tem simulacao, a ultima mensagem da conversa e
 * nossa (ele nao respondeu) e ninguem falou nada hoje. Uma vez por virada. Fica de fora o que
 * ja e de gente: pausada, transferida, esperando o supervisor, humano depois da ultima mensagem
 * dele, etiqueta fechou/consultor e BYD (da Leticya). Desliga com ISA_VIRADA_DO_DIA=off.
 */
export async function chamarNaViradaDoDia(): Promise<{ enviados: number; motivo?: string }> {
  if (process.env.ISA_VIRADA_DO_DIA === 'off') return { enviados: 0, motivo: 'desligada' }
  const agora = new Date()
  if (!dentroDoHorario(agora) || horaNoRio(agora) < A_PARTIR_DAS) return { enviados: 0, motivo: 'fora_do_horario' }

  const candidatos = await sql<ContatoIsa & { lead_nome: string | null; marca: string | null }>(
    `SELECT c.*, l.nome AS lead_nome, l.marca_interesse AS marca
       FROM public.isa_contatos c
       JOIN public.leads l ON l.id = c.lead_id
      WHERE c.ligada
        AND c.pausa_motivo IS NULL
        AND c.transferido_em IS NULL
        AND c.aguardando_dono IS NULL
        AND c.conversation_id IS NOT NULL
        AND (c.retomar_apos IS NULL OR c.retomar_apos < now())
        AND NOT (c.etiquetas && ARRAY['fechou', 'consultor']::text[])
        -- janela aberta com folga: a mensagem precisa chegar antes de ela fechar
        AND c.janela_ate > now() + interval '10 minutes'
        -- a ultima mensagem dele foi ONTEM (ou antes), no dia do Rio
        AND (c.ultimo_inbound_em AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        -- alguem do time assumiu depois da ultima mensagem dele: a pessoa conduz
        AND (c.humano_em IS NULL OR c.humano_em < c.ultimo_inbound_em)
        -- a ultima mensagem da conversa e nossa e nao e de hoje
        AND (SELECT m.direction FROM public.messages m WHERE m.conversation_id = c.conversation_id
              ORDER BY m.created_at DESC LIMIT 1) = 'outbound'
        -- messages.created_at e timestamp SEM fuso gravado em UTC: sem o AT TIME ZONE 'UTC' antes,
        -- quem falou depois das 21h de ontem contava como "hoje" e ficava de fora (26/09/2026)
        AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = c.conversation_id
              AND (m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date)
        AND NOT EXISTS (SELECT 1 FROM public.isa_eventos e WHERE e.telefone = c.telefone
              AND e.tipo = 'virada_do_dia' AND e.created_at > now() - interval '20 hours')
      ORDER BY c.janela_ate
      LIMIT $1`,
    [POR_RODADA],
  )

  let enviados = 0
  for (const c of candidatos) {
    if (ehByd(c.marca)) continue
    // Marca ANTES de enviar: erro no meio nao vira segunda mensagem.
    await registrarEvento(c.telefone, 'virada_do_dia', { lead: c.lead_id })
    const texto = mensagemViradaDoDia({ primeiroNome: primeiroNomeDe(c.nome ?? c.lead_nome), cumprimento: cumprimento(agora) })
    const enviou = await enviarComoGente(c, [texto], undefined, c.ultimo_inbound_em).catch((err) => {
      console.error('[isa] virada do dia falhou:', err)
      return false
    })
    if (enviou) enviados++
  }
  return { enviados }
}
