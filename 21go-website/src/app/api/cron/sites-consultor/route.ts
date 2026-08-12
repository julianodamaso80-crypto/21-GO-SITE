import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esquecerConsultor } from '@/lib/consultor'
import { cancelarAssinatura, cobrancaEmAberto, saudeDoWebhook } from '@/lib/asaas'
import { avisar, textoVenceHoje, textoCancelado } from '@/lib/whatsapp-avisos'
import { entregarSeOTestePassar } from '@/lib/entregar-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O ciclo de cobranca do site do consultor, uma vez por dia.
 *
 * Regra do dono: *"boleto atrasou 5 dias voce cancela o site dele, avisa que vai
 * cancelar no dia que vence, com educacao, falando que no futuro se precisar ele
 * volta a procurar"*.
 *
 * Entao sao dois momentos, e so dois:
 *   D+0  vence hoje  -> aviso educado, site continua no ar
 *   D+5  cinco dias  -> corta o site e avisa, deixando a porta aberta
 *
 * Quem PAGA nao passa por aqui: o webhook do Asaas ja poe em `ativo` no mesmo
 * minuto. Este cron so cuida de quem nao pagou.
 */

const DIAS_ATE_CORTAR = 5

/** Pra onde vai o alerta quando a cobranca para de funcionar. */
const DONO = '5521992208062'

interface Linha {
  slug: string
  nome: string
  whatsapp: string
  status: string
  proximo_vencimento: string | null
  asaas_subscription_id: string | null
  aviso_vencimento_ref: string | null
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const supa = supabaseAdmin()
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const { data, error } = await supa
    .from('sites_consultor')
    .select('slug, nome, whatsapp, status, proximo_vencimento, asaas_subscription_id, aviso_vencimento_ref')
    .in('status', ['pendente', 'ativo', 'inadimplente'])

  if (error) {
    console.error('[cron sites]', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const linhas = (data || []) as Linha[]
  const relatorio = { olhados: linhas.length, avisados: 0, cortados: 0, erros: 0, entregues: 0 }

  // ─── Quem pagou mas ainda nao recebeu o link ──────────────────────────────
  // Este e o "arrumar ate cair no Power ideal": enquanto o teste nao passar, o
  // link nao sai, e todo dia se tenta de novo. Se alguem consertar o PowerLink
  // no Power, a entrega acontece sozinha no dia seguinte.
  const { data: aEntregar } = await supa
    .from('sites_consultor')
    .select('slug, nome, whatsapp, powerlink_id')
    .eq('status', 'ativo')
    .is('link_enviado_em', null)

  for (const s of (aEntregar || []) as { slug: string; nome: string; whatsapp: string; powerlink_id: string }[]) {
    try {
      const r = await entregarSeOTestePassar({
        slug: s.slug,
        nome: s.nome,
        whatsapp: s.whatsapp,
        powerlinkId: s.powerlink_id,
      })
      if (r.entregue) relatorio.entregues++
    } catch (err) {
      relatorio.erros++
      console.error('[cron sites] entrega', s.slug, (err as Error).message)
    }
  }

  for (const s of linhas) {
    if (!s.proximo_vencimento) continue

    const venc = new Date(`${s.proximo_vencimento}T00:00:00`)
    const diasVencido = Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000)

    try {
      if (diasVencido >= DIAS_ATE_CORTAR) {
        await cortar(s)
        relatorio.cortados++
      } else if (diasVencido >= 0 && s.aviso_vencimento_ref !== s.proximo_vencimento) {
        // `aviso_vencimento_ref` guarda QUAL vencimento ja foi avisado. Assim o
        // aviso sai uma vez por mes, e nao uma vez por dia ate a pessoa pagar.
        await avisarVencimento(s)
        relatorio.avisados++
      }
    } catch (err) {
      relatorio.erros++
      console.error('[cron sites]', s.slug, (err as Error).message)
    }
  }

  // A checagem que impede a falha silenciosa: webhook parado = nenhum pagamento
  // e reconhecido, e o sistema inteiro fica "quieto" como se estivesse tudo bem.
  const saude = await saudeDoWebhook().catch((err) => ({
    ok: false,
    motivo: `não consegui checar o webhook: ${(err as Error).message}`,
  }))

  if (!saude.ok) {
    console.error('[cron sites] WEBHOOK COM PROBLEMA:', saude.motivo)
    await avisar(
      DONO,
      `⚠️ 21Go — atenção no Asaas\n\n${saude.motivo}.\n\n` +
        `Enquanto isso, pagamento de site de consultor não sobe site sozinho. ` +
        `Conserto: recriar o webhook (isso zera a penalização).`,
    ).catch(() => {})
  }

  const saida = { ...relatorio, webhook: saude.ok ? 'ok' : saude.motivo }
  console.log('[cron sites]', JSON.stringify(saida))
  return NextResponse.json(saida)
}

async function avisarVencimento(s: Linha): Promise<void> {
  const supa = supabaseAdmin()

  const cobranca = s.asaas_subscription_id
    ? await cobrancaEmAberto(s.asaas_subscription_id).catch(() => null)
    : null

  await avisar(s.whatsapp, textoVenceHoje(s.nome, s.slug, cobranca?.link ?? null))

  // Marca mesmo se o WhatsApp falhou: o aviso e cortesia, e reenviar todo dia
  // por causa de uma instancia fora do ar seria pior que nao avisar.
  await supa
    .from('sites_consultor')
    .update({
      aviso_vencimento_em: new Date().toISOString(),
      aviso_vencimento_ref: s.proximo_vencimento,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', s.slug)
}

async function cortar(s: Linha): Promise<void> {
  const supa = supabaseAdmin()

  // Para de gerar cobranca nova. Se falhar, o site sai do ar assim mesmo — o
  // consultor nao pode continuar sendo servido porque o Asaas deu erro.
  if (s.asaas_subscription_id) {
    await cancelarAssinatura(s.asaas_subscription_id).catch((err) =>
      console.error('[cron sites] nao cancelei a assinatura', s.slug, (err as Error).message),
    )
  }

  await supa
    .from('sites_consultor')
    .update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      aviso_cancelamento_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('slug', s.slug)

  // Sem isto o site cortado continuaria no ar por ate 5 minutos (TTL do cache).
  esquecerConsultor(s.slug)

  await avisar(s.whatsapp, textoCancelado(s.nome, s.slug))
  console.log(`[cron sites] cortado: ${s.slug}`)
}
