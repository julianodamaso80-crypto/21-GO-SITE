import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esquecerConsultor } from '@/lib/consultor'
import { cancelarAssinatura, cobrancaEmAberto, situacaoDeCobranca, saudeDoWebhook } from '@/lib/asaas'
import {
  avisar,
  avisarDono,
  saudeDoCanal,
  textoPrimeiroAviso,
  textoUltimoDia,
  textoVesperaDoVencimento,
} from '@/lib/whatsapp-avisos'
import { entregarSeOTestePassar } from '@/lib/entregar-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O ciclo de cobranca do site do consultor, uma vez por dia.
 *
 * ─── O calendario, ordem do dono (21/08/2026) ────────────────────────────────
 *
 *   *"VC ENVIA SO O PAGAMENTO 5 DIAS ANTES DE VENCER CADA CLIENTE, EXEMPLO SE
 *   VENCE DIA 5 VC ENVIA DIA 1, DEPOIS ENVIA NO DIA 4, E SE NAO PAGOU FALA QUE
 *   E ULTIMO DIA NO DIA 5. E SE NAO PAGOU VC CANCELA O SITE SEM MAIS NENHUMA
 *   MENSAGEM 2 DIAS DEPOIS. CADA UM TEM SEU DIA DE VENCIMENTO, VC TEM QUE
 *   COBRAR O CLIENTE NA DATA CERTA E NAO DATA ERRADA."*
 *
 *   D-4  primeiro aviso, com o link (o "dia 1" do exemplo dele)
 *   D-1  vespera
 *   D0   ultimo dia
 *   D+2  corta o site, MUDO — nenhuma mensagem
 *
 * Nada sai fora dessas quatro marcas. Antes de D-4 e cedo demais, entre D0 e
 * D+2 ja foi dito tudo, e depois do corte nao se fala mais nada.
 *
 * ─── A data que manda ────────────────────────────────────────────────────────
 *
 * O dia de vencimento e o DE CADA UM, tirado do Asaas — nunca uma data fixa do
 * mes, nunca a copia local sozinha. E nao e a parcela aberta crua: e o
 * `vencimentoEfetivo`, que respeita "quem pagou tem 30 dias" mesmo quando o
 * dinheiro caiu na parcela errada (o caso do hugoaguiar, 17/08/2026).
 *
 * Quem PAGA nao passa por aqui: o webhook do Asaas ja poe em `ativo` no mesmo
 * minuto. Este cron so cuida de quem nao pagou.
 */

/** Dias DEPOIS do vencimento ate o corte. Ordem do dono: 2. */
const DIAS_ATE_CORTAR = 2

/** Antecedencia do primeiro aviso, em dias. O "vence dia 5 → avisa dia 1". */
const PRIMEIRO_AVISO_DIAS = 4

/** Pra onde vai o alerta quando a cobranca para de funcionar. */
const DONO = '5521992208062'

/** As tres mensagens do ciclo, na ordem em que saem. */
type Etapa = 'd4' | 'd1' | 'd0'

interface Linha {
  slug: string
  nome: string
  whatsapp: string
  status: string
  proximo_vencimento: string | null
  asaas_subscription_id: string | null
  aviso_etapas: string | null
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
    .select('slug, nome, whatsapp, status, proximo_vencimento, asaas_subscription_id, aviso_etapas')
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
      }, { alertarDono: true })
      if (r.entregue) relatorio.entregues++
    } catch (err) {
      relatorio.erros++
      console.error('[cron sites] entrega', s.slug, (err as Error).message)
    }
  }

  for (const s of linhas) {
    // ─── A verdade vem do Asaas, nao da coluna ───────────────────────────────
    // `proximo_vencimento` e uma copia, e copia envelhece: ate 15/08/2026 o
    // webhook nao a atualizava no pagamento, entao ela ficava congelada na
    // parcela JA QUITADA. Naquele dia quatro consultores em dia receberam
    // "sua mensalidade vence hoje", e em 5 dias teriam a assinatura cancelada
    // e o site derrubado. Cobrar e cortar sao acoes que nao se desfazem: elas
    // passaram a exigir uma cobranca em aberto confirmada na fonte.
    if (!s.asaas_subscription_id) continue

    const situacao = await situacaoDeCobranca(s.asaas_subscription_id).catch(() => null)

    // Asaas fora do ar: nao da pra saber quem esta devendo. Nao corta as cegas.
    if (!situacao) {
      console.warn(`[cron sites] ${s.slug}: nao consegui ler o Asaas — pulando`)
      relatorio.erros++
      continue
    }

    const { aberta, vencimentoEfetivo } = situacao

    // Sem nada em aberto e sem ciclo correndo = esta em dia. Zera a data velha
    // pra coluna nao continuar mentindo, e segue sem avisar nem cortar.
    if (!vencimentoEfetivo) {
      if (s.proximo_vencimento) await gravarVencimento(s.slug, null)
      continue
    }

    // Divergiu: a coluna estava velha. Corrige de passagem — assim o proprio
    // cron cura o dado em vez de repetir o erro todo dia.
    if (vencimentoEfetivo !== s.proximo_vencimento) {
      await gravarVencimento(s.slug, vencimentoEfetivo)
      s.proximo_vencimento = vencimentoEfetivo
    }

    const venc = new Date(`${vencimentoEfetivo}T00:00:00`)
    // Positivo = ainda falta; zero = vence hoje; negativo = ja venceu.
    const faltam = Math.round((venc.getTime() - hoje.getTime()) / 86_400_000)

    // ⚠️ Sem parcela aberta no Asaas nao ha nem o que cobrar nem por que cortar,
    // e a data acima e so o piso do ciclo (pagamento + 30) — nao um vencimento
    // de verdade. Avisar com ela seria dizer uma data que o Asaas ainda vai
    // desmentir: a Renata pagou em 21/08 e o piso deu 20/09, mas a parcela dela,
    // quando o Asaas gerar, vai vencer em 24/09. Cobranca em data errada e
    // exatamente o que nao pode sair — entao espera a parcela existir de fato.
    if (!aberta.vencimento) continue

    try {
      if (faltam <= -DIAS_ATE_CORTAR) {
        await cortar(s)
        relatorio.cortados++
        continue
      }

      const etapa = etapaDoDia(faltam)
      if (!etapa) continue

      // ─── Quem nunca pagou nao entra no ciclo de cobranca ────────────────────
      // `pendente` e quem clicou em contratar e nunca pagou: nao tem site no ar
      // e nao e cliente. Mandar "sua mensalidade vence amanha" pra ele seria
      // cobrar uma pessoa que nao contratou nada de fato — e o texto ainda
      // falaria de um site que ela nao tem. O corte no D+2 continua valendo pra
      // ela: cancela a assinatura e para de gerar cobranca.
      if (s.status === 'pendente') continue

      if (jaAvisou(s.aviso_etapas, vencimentoEfetivo, etapa)) continue

      await avisarEtapa(s, etapa, vencimentoEfetivo, aberta.link)
      relatorio.avisados++
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
    await avisarDono(
      DONO,
      `⚠️ 21Go — atenção no Asaas\n\n${saude.motivo}.\n\n` +
        `Enquanto isso, pagamento de site de consultor não sobe site sozinho. ` +
        `Conserto: recriar o webhook (isso zera a penalização).`,
    ).catch(() => {})
  }

  // ─── O WhatsApp do dono esta de pe? ───────────────────────────────────────
  // A outra metade da falha silenciosa de 21/08/2026: o webhook estava perfeito,
  // o problema era o chip dele `close`. Como e o UNICO numero que fala com
  // consultor, ele fora significa que nada sai — nem entrega, nem cobranca.
  // Este alerta e o que ele pediu no lugar de "manda por outro numero".
  const canal = await saudeDoCanal().catch(() => ({ ok: false, estado: 'não consegui checar' }))
  if (!canal.ok) {
    console.error('[cron sites] WHATSAPP DO DONO:', canal.estado)
    await avisarDono(
      DONO,
      `🚨 21Go — seu WhatsApp está *${canal.estado}*\n\n` +
        `Venda de site só sai pelo seu número, então enquanto ele estiver fora ` +
        `ninguém recebe site e ninguém é cobrado. Não mandei nada por outro número.\n\n` +
        `Conserto: reconectar pelo QR code no Evolution.`,
    ).catch(() => {})
  }

  const saida = {
    ...relatorio,
    webhook: saude.ok ? 'ok' : saude.motivo,
    whatsappDono: canal.estado,
  }
  console.log('[cron sites]', JSON.stringify(saida))
  return NextResponse.json(saida)
}

/**
 * Qual mensagem o dia de hoje pede — ou nenhuma.
 *
 * ⚠️ D-1 e D0 sao dias EXATOS, nao faixas, de proposito. "Vence amanha" e "hoje
 * e o ultimo dia" sao afirmacoes sobre uma data especifica: mandadas com um dia
 * de atraso viram cobranca em data errada, que e exatamente o que nao pode
 * acontecer. Se o cron nao rodar naquele dia, a mensagem simplesmente nao sai.
 *
 * O primeiro aviso e o unico com faixa (D-4 a D-2) porque o texto dele diz a
 * data por extenso ("vence em 05/09"), entao continua correto em qualquer dia
 * da janela — e nunca antes dos 5 dias que o dono estipulou.
 */
function etapaDoDia(faltam: number): Etapa | null {
  if (faltam === 0) return 'd0'
  if (faltam === 1) return 'd1'
  if (faltam >= 2 && faltam <= PRIMEIRO_AVISO_DIAS) return 'd4'
  return null
}

/**
 * Se esta etapa ja saiu para ESTE vencimento.
 *
 * O registro guarda o vencimento junto (`2026-09-15|d4,d1`) porque a etapa
 * sozinha nao diz nada: `d4` do mes passado nao pode calar o `d4` deste mes.
 * Vencimento novo comeca a lista do zero.
 */
function jaAvisou(registro: string | null, vencimento: string, etapa: Etapa): boolean {
  if (!registro) return false
  const [venc, etapas] = registro.split('|')
  if (venc !== vencimento) return false
  return (etapas || '').split(',').includes(etapa)
}

function marcarEtapa(registro: string | null, vencimento: string, etapa: Etapa): string {
  const [venc, etapas] = (registro || '').split('|')
  const anteriores = venc === vencimento ? (etapas || '').split(',').filter(Boolean) : []
  return `${vencimento}|${[...new Set([...anteriores, etapa])].join(',')}`
}

async function avisarEtapa(
  s: Linha,
  etapa: Etapa,
  vencimento: string,
  link: string | null,
): Promise<void> {
  const supa = supabaseAdmin()

  const texto =
    etapa === 'd4'
      ? textoPrimeiroAviso(s.nome, s.slug, vencimento, link)
      : etapa === 'd1'
        ? textoVesperaDoVencimento(s.nome, s.slug, link)
        : textoUltimoDia(s.nome, s.slug, link)

  const saiu = await avisar(s.whatsapp, texto)

  // ⚠️ So marca se a mensagem SAIU. Marcar no escuro (como era ate 21/08/2026)
  // significa que um canal fora do ar consome a etapa em silencio: o consultor
  // nunca recebe o aviso, e dois dias depois perde o site sem ter sido avisado.
  // Nao saiu, tenta de novo amanha — dentro da janela da propria etapa.
  if (!saiu) {
    console.error(`[cron sites] ${s.slug}: aviso ${etapa} não saiu, tento amanhã`)
    return
  }

  await supa
    .from('sites_consultor')
    .update({
      aviso_vencimento_em: new Date().toISOString(),
      aviso_vencimento_ref: vencimento,
      aviso_etapas: marcarEtapa(s.aviso_etapas, vencimento, etapa),
      updated_at: new Date().toISOString(),
    })
    .eq('slug', s.slug)

  console.log(`[cron sites] ${s.slug}: aviso ${etapa} enviado (vence ${vencimento})`)
}

/**
 * Alinha a copia local com o Asaas.
 *
 * `null` quando nao ha nada em aberto: o laco pula quem esta sem
 * `proximo_vencimento`, entao zerar e o jeito de dizer "esta em dia" sem
 * deixar uma data vencida ali dando ordem de corte.
 */
async function gravarVencimento(slug: string, vencimento: string | null): Promise<void> {
  await supabaseAdmin()
    .from('sites_consultor')
    .update({ proximo_vencimento: vencimento, updated_at: new Date().toISOString() })
    .eq('slug', slug)
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
      updated_at: new Date().toISOString(),
    })
    .eq('slug', s.slug)

  // Sem isto o site cortado continuaria no ar por ate 5 minutos (TTL do cache).
  esquecerConsultor(s.slug)

  // ⚠️ Sem mensagem, de proposito — ordem do dono (21/08/2026): *"se nao pagou
  // vc cancela o site SEM MAIS NENHUMA MENSAGEM 2 dias depois"*. Ele ja recebeu
  // tres avisos (D-4, D-1, D0); a quarta mensagem seria cobranca chata.
  console.log(`[cron sites] cortado (mudo): ${s.slug}`)
}
