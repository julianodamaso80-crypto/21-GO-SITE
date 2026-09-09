import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendText, sendPresence, sleep, randInt, formatPhone } from '@/lib/whatsapp'
import { numeroExisteNoWhatsApp } from '@/lib/whatsapp-existe'
import { montarMensagemRecuperacao, type PlanoDaTela } from '@/lib/mensagem-recuperacao'
import { saudeDosChips } from '@/lib/chip-saude'
import {
  chaveDo,
  dentroDaJanela,
  diaDeBrasilia,
  tetoDiario,
  LOTE_POR_EXECUCAO,
  INTERVALO_MIN_MS,
  INTERVALO_MAX_MS,
  FALHAS_ATE_DESLIGAR,
  type ChipRecuperacao,
} from '@/lib/chips-recuperacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Quem simulou, viu os planos e não clicou em "Quero contratar".
 *
 * Roda de 5 em 5 minutos e aborda no máximo 2 leads por vez. São ~26 leads por
 * dia elegíveis; o gargalo aqui é de propósito, porque o que derruba chip não é
 * o total do mês, é o ritmo.
 *
 * ─── Quem NUNCA entra ────────────────────────────────────────────────────────
 *
 * Lead com `consultor_slug` fica de fora, sem exceção. O site vendido é do
 * consultor: o lead dele abordado pelo nosso chip chega assinado por outra
 * pessoa e vira lead roubado de quem pagou pelo site. São 216 dos 993 leads dos
 * últimos 30 dias — a maior fatia que este cron deixa passar, e está certo
 * assim.
 *
 * ─── A janela de 24h ─────────────────────────────────────────────────────────
 *
 * Só lead de até 24 horas. Passou disso, a simulação esfriou e a mensagem vira
 * abordagem fria de estranho — que é exatamente o padrão que o WhatsApp pune.
 */

const ESPERA_MINUTOS = 5
const JANELA_HORAS = 24
/** Não abordar duas vezes o mesmo telefone dentro desse prazo. */
const DEDUP_DIAS = 30

/** ISO em UTC sem sufixo — `created_at` é timestamp sem timezone, em UTC. */
function utcSem(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '')
}

interface LeadElegivel {
  id: string
  nome: string | null
  whatsapp: string | null
  telefone: string | null
  marca_interesse: string | null
  modelo_interesse: string | null
  placa_interesse: string | null
  cotacao_plano: string | null
  cotacao_valor: number | null
  cotacao_planos: PlanoDaTela[] | null
}

interface ChipEmUso {
  chip: ChipRecuperacao
  saldo: number
  falhas: number
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  /**
   * `?simular=1` percorre tudo — saúde dos chips, fila, dedup, mensagem — e
   * devolve o que SAIRIA, sem mandar nada. É como se confere que a abordagem
   * está certa antes de a primeira mensagem chegar num cliente de verdade.
   */
  const simular = new URL(req.url).searchParams.get('simular') === '1'

  const agora = new Date()
  if (!dentroDaJanela(agora) && !simular) {
    return NextResponse.json({ ok: true, pulou: 'fora_da_janela' })
  }

  const supa = supabaseAdmin()
  const relatorio = {
    enviados: 0,
    semWhatsApp: 0,
    semPreco: 0,
    jaAbordado: 0,
    falhas: 0,
    chips: [] as { instancia: string; saldo: number; motivo: string }[],
  }
  /** Só em `?simular=1`: o que sairia, pra conferir antes de ligar. */
  const previa: {
    leadId: string
    telefone: string
    chip: string
    numeroNoWhatsApp: string
    mensagem: string
  }[] = []

  /* ── Quais chips podem falar hoje ───────────────────────────────────────── */

  const saude = await saudeDosChips()
  const inicioDoDia = `${diaDeBrasilia(agora)}T00:00:00`
  const disponiveis: ChipEmUso[] = []

  for (const s of saude) {
    if (!s.apto) {
      console.warn(`[recuperacao] chip ${s.chip.instancia} fora: ${s.motivo}`)
      relatorio.chips.push({ instancia: s.chip.instancia, saldo: 0, motivo: s.motivo })
      continue
    }
    const { count } = await supa
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('evolution_instance', s.chip.instancia)
      .gte('follow_up_data', inicioDoDia)

    const saldo = tetoDiario(s.chip, agora) - (count || 0)
    relatorio.chips.push({
      instancia: s.chip.instancia,
      saldo: Math.max(0, saldo),
      motivo: saldo > 0 ? 'ok' : 'teto do dia atingido',
    })
    if (saldo > 0) disponiveis.push({ chip: s.chip, saldo, falhas: 0 })
  }

  if (disponiveis.length === 0) {
    return NextResponse.json({ ok: true, pulou: 'nenhum_chip_disponivel', ...relatorio })
  }

  /* ── Quem está esperando ────────────────────────────────────────────────── */

  const { data: leads, error } = await supa
    .from('leads')
    .select(
      'id, nome, whatsapp, telefone, marca_interesse, modelo_interesse, placa_interesse, cotacao_plano, cotacao_valor, cotacao_planos',
    )
    .eq('qualificado_por', 'site')
    .eq('cotacao_enviada', true)
    .is('consultor_slug', null)
    .eq('whatsapp_clicado', false)
    .eq('follow_up_enviado', false)
    // `whatsapp_valido` só é `false` pra quem o WhatsApp disse que não existe.
    // Tem que ser `or` com `is.null`: em SQL, `!= false` descarta NULL — e NULL
    // é justamente o estado de todo mundo que ainda não foi checado.
    .or('whatsapp_valido.is.null,whatsapp_valido.is.true')
    .lte('created_at', utcSem(agora.getTime() - ESPERA_MINUTOS * 60_000))
    .gte('created_at', utcSem(agora.getTime() - JANELA_HORAS * 3_600_000))
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[recuperacao] falha ao buscar leads:', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const fila = (leads || []) as LeadElegivel[]
  let vez = 0

  for (const lead of fila) {
    if (relatorio.enviados >= LOTE_POR_EXECUCAO) break
    if (disponiveis.length === 0) break

    const bruto = lead.whatsapp || lead.telefone
    if (!bruto || !lead.nome) continue

    const telefone = formatPhone(bruto)

    /* Mesmo telefone já abordado? Uma vez por pessoa, não uma por simulação. */
    const { count: jaFalamos } = await supa
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('follow_up_enviado', true)
      .in('whatsapp', [telefone, bruto])
      .gte('follow_up_data', utcSem(agora.getTime() - DEDUP_DIAS * 86_400_000))

    if ((jaFalamos || 0) > 0) {
      relatorio.jaAbordado++
      // Marca como tratado pra ele não voltar na fila a cada 5 minutos.
      if (!simular) {
        await supa
          .from('leads')
          .update({ follow_up_enviado: true, follow_up_data: utcSem(Date.now()) })
          .eq('id', lead.id)
      }
      continue
    }

    const mensagem = montarMensagemRecuperacao({
      nome: lead.nome,
      marca: lead.marca_interesse,
      modelo: lead.modelo_interesse,
      placa: lead.placa_interesse,
      planoEscolhido: lead.cotacao_plano,
      valorEscolhido: lead.cotacao_valor,
      planos: lead.cotacao_planos,
      seed: lead.id,
      linkPdf: `https://21go.site/api/pdfs/${lead.id}`,
    })

    if (!mensagem) {
      relatorio.semPreco++
      continue
    }

    /* O número existe mesmo? Envio pra número morto é sinal de disparo. */
    const existe = await numeroExisteNoWhatsApp(telefone)
    if (existe === 'nao_existe') {
      relatorio.semWhatsApp++
      if (!simular) {
        await supa.from('leads').update({ whatsapp_valido: false }).eq('id', lead.id)
      }
      continue
    }

    /* Rodízio: alterna os chips a cada envio. */
    const emUso = disponiveis[vez % disponiveis.length]
    vez++

    const conta = { instancia: emUso.chip.instancia, chave: chaveDo(emUso.chip) }

    if (simular) {
      previa.push({
        leadId: lead.id,
        telefone,
        chip: emUso.chip.instancia,
        numeroNoWhatsApp: existe,
        mensagem,
      })
      relatorio.enviados++
      emUso.saldo--
      continue
    }

    try {
      if (relatorio.enviados > 0) {
        await sleep(randInt(INTERVALO_MIN_MS, INTERVALO_MAX_MS))
      }
      await sendPresence(telefone, 'composing', randInt(2000, 5000))
      await sleep(randInt(2000, 5000))
      await sendText(telefone, mensagem, conta)

      await supa
        .from('leads')
        .update({
          follow_up_enviado: true,
          follow_up_data: utcSem(Date.now()),
          evolution_instance: emUso.chip.instancia,
          whatsapp_valido: true,
        })
        .eq('id', lead.id)

      relatorio.enviados++
      emUso.saldo--
      emUso.falhas = 0
      if (emUso.saldo <= 0) {
        disponiveis.splice(disponiveis.indexOf(emUso), 1)
      }
    } catch (err) {
      relatorio.falhas++
      emUso.falhas++
      console.error(
        `[recuperacao] envio falhou (${emUso.chip.instancia}):`,
        err instanceof Error ? err.message : err,
      )
      if (emUso.falhas >= FALHAS_ATE_DESLIGAR) {
        console.error(`[recuperacao] chip ${emUso.chip.instancia} desligado nesta rodada`)
        disponiveis.splice(disponiveis.indexOf(emUso), 1)
      }
    }
  }

  console.log('[recuperacao]', simular ? 'SIMULACAO' : '', JSON.stringify(relatorio))
  return NextResponse.json({
    ok: true,
    simulacao: simular,
    fila: fila.length,
    ...relatorio,
    ...(simular ? { previa } : {}),
  })
}
