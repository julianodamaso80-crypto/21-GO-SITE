import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esquecerConsultor } from '@/lib/consultor'
import { entregarSeOTestePassar } from '@/lib/entregar-site'
import { cobrancaEmAberto } from '@/lib/asaas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook do Asaas — quem liga e desliga o site do consultor.
 *
 * ─── Tres regras que o Asaas impoe e que este arquivo obedece ────────────────
 *
 * 1. **Responder 2xx sempre que o token bater.** Depois de 15 falhas seguidas o
 *    Asaas INTERROMPE a fila: os eventos continuam sendo gerados mas param de
 *    chegar, e sao apagados em 14 dias. Um erro nosso derrubaria a cobranca de
 *    todo mundo em silencio. Por isso evento desconhecido, consultor que nao
 *    existe e ate falha no nosso banco respondem 200 — o problema vai pro log,
 *    nao pro status.
 *
 * 2. **Entrega "at least once".** O mesmo evento chega de novo sempre que a
 *    resposta demora. A trava e o INSERT do `id` em `asaas_eventos`: conflito
 *    significa "ja processei" e o resto nem roda.
 *
 * 3. **Token no header `asaas-access-token`.** Nao ha assinatura HMAC — o token
 *    e a unica autenticacao, entao sem ele configurado o endpoint recusa tudo
 *    em vez de aceitar qualquer POST que chegue na URL.
 */

const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || ''

interface EventoAsaas {
  id?: string
  event?: string
  payment?: { id?: string; customer?: string; subscription?: string }
}

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    console.error('[asaas] ASAAS_WEBHOOK_TOKEN ausente — recusando webhook')
    return NextResponse.json({ error: 'nao configurado' }, { status: 503 })
  }
  if (req.headers.get('asaas-access-token') !== TOKEN) {
    console.warn('[asaas] token invalido')
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  let corpo: EventoAsaas
  try {
    corpo = (await req.json()) as EventoAsaas
  } catch {
    return NextResponse.json({ error: 'json invalido' }, { status: 400 })
  }

  const eventoId = corpo.id
  const tipo = corpo.event
  if (!eventoId || !tipo) {
    console.warn('[asaas] evento sem id ou tipo', JSON.stringify(corpo).slice(0, 200))
    return NextResponse.json({ ok: true, ignorado: 'sem id/tipo' })
  }

  const supa = supabaseAdmin()

  // A trava de idempotencia. Vem ANTES de qualquer efeito: se o insert falhar
  // por conflito, este evento ja foi processado numa entrega anterior.
  const { error: erroInsert } = await supa.from('asaas_eventos').insert({
    id: eventoId,
    tipo,
    payment_id: corpo.payment?.id ?? null,
    customer_id: corpo.payment?.customer ?? null,
    subscription_id: corpo.payment?.subscription ?? null,
    payload: corpo,
  })

  if (erroInsert) {
    // 23505 = unique_violation: reentrega do mesmo evento, tudo certo.
    if (erroInsert.code === '23505') {
      return NextResponse.json({ ok: true, repetido: eventoId })
    }
    // Qualquer outra falha de banco: registra e devolve 200 assim mesmo, senao
    // uma indisponibilidade do Supabase interrompe a fila do Asaas inteira.
    console.error('[asaas] nao gravei o evento', eventoId, erroInsert.message)
    return NextResponse.json({ ok: true, aviso: 'evento nao gravado' })
  }

  const assinatura = corpo.payment?.subscription
  if (!assinatura) {
    // Cobranca avulsa (nao e assinatura de site) — nada a fazer aqui.
    return NextResponse.json({ ok: true, ignorado: 'sem assinatura' })
  }

  try {
    await aplicar(tipo, assinatura)
  } catch (err) {
    console.error('[asaas] falhei ao aplicar', tipo, assinatura, (err as Error).message)
  }

  return NextResponse.json({ ok: true })
}

/**
 * O que cada evento faz com o site.
 *
 * CONFIRMED e o gatilho de ativacao, nao RECEIVED: "confirmado" e o dinheiro
 * pago mas ainda nao disponivel na conta Asaas, e no boleto isso e um dia util
 * de diferenca. Segurar o site por um dia depois do cliente ja ter pago seria
 * cobrar por um servico que nao entregamos ainda.
 */
async function aplicar(tipo: string, assinatura: string): Promise<void> {
  const supa = supabaseAdmin()

  const alvo = { asaas_subscription_id: assinatura }
  let mudanca: Record<string, unknown> | null = null

  switch (tipo) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      // `proximo_vencimento` TEM que andar junto com o pagamento. Sem isto ele
      // ficava congelado na parcela que a pessoa acabou de quitar, e o cron
      // (que conta os 5 dias a partir dele) passava a tratar quem pagou como
      // inadimplente: em 15/08/2026 quatro consultores em dia receberam
      // "sua mensalidade vence hoje", e em 5 dias teriam o site cortado.
      const proxima = await cobrancaEmAberto(assinatura).catch(() => null)
      mudanca = {
        status: 'ativo',
        cancelado_em: null,
        updated_at: new Date().toISOString(),
        // Sem cobranca aberta o ciclo acabou de fechar e a proxima ainda nao
        // existe: limpar e melhor que manter data vencida, porque o cron pula
        // quem esta com `proximo_vencimento` nulo.
        proximo_vencimento: proxima?.vencimento ?? null,
      }
      break
    }

    case 'PAYMENT_OVERDUE':
      // So marca. O corte e no 5o dia e quem conta os dias e o cron — nao este
      // webhook, que chega uma vez so no dia do vencimento.
      mudanca = { status: 'inadimplente', updated_at: new Date().toISOString() }
      break

    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      mudanca = {
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      break

    default:
      return
  }

  // Le o estado ANTES do update: e ele que diz se esta e a primeira ativacao
  // (merece a mensagem de boas-vindas) ou so a mensalidade de mais um mes.
  const { data: antes } = await supa
    .from('sites_consultor')
    .select('slug, status, nome, whatsapp, powerlink_id')
    .match(alvo)
    .maybeSingle()

  if (!antes) {
    // Esperado: a conta do Asaas e compartilhada com outros produtos, entao
    // chega aqui evento de cobranca que nao tem nada a ver com site.
    console.log(`[asaas] ${tipo}: assinatura ${assinatura} não é de site, ignorando`)
    return
  }

  const { data } = await supa.from('sites_consultor').update(mudanca).match(alvo).select('slug')
  const slug = data?.[0]?.slug as string | undefined
  if (!slug) return

  // O lookup tem cache de 5 min. Sem isto, um site pago continuaria fora do ar
  // (ou um cancelado continuaria no ar) por ate cinco minutos.
  esquecerConsultor(slug)
  console.log(`[asaas] ${tipo} -> ${slug} agora e "${mudanca.status}"`)

  // A primeira vez que sai de "pendente" e a unica que merece aviso: mandar
  // "seu site esta no ar" todo mes, na renovacao, seria spam.
  //
  // ⚠️ E o link NAO sai daqui direto. Ele so pode ser enviado depois de provado
  // que o lead cai no Power dele — ver `entregarSeOTestePassar`. Se o teste
  // falhar, o cron diario tenta de novo ate dar certo.
  if (mudanca.status === 'ativo' && antes.status === 'pendente') {
    await entregarSeOTestePassar({
      slug,
      nome: antes.nome as string,
      whatsapp: antes.whatsapp as string,
      powerlinkId: antes.powerlink_id as string,
    }).catch((err) => console.error('[asaas] teste do powerlink falhou', slug, err))
  }
}
