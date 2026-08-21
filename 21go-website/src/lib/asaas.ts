import 'server-only'

/**
 * Cliente do Asaas — so o que o site do consultor precisa.
 *
 * Regra do dono: o Asaas NAO avisa ninguem. Todo customer nasce com
 * `notificationDisabled: true` porque cada e-mail/SMS que eles disparam e
 * cobrado, e quem fala com o consultor e o nosso WhatsApp, de graca.
 */

const BASE = 'https://api.asaas.com/v3'
const KEY = process.env.ASAAS_API_KEY

// O preco mora em `lib/precos.ts` (o formulario, que e client, tambem le de la
// e nao pode importar deste arquivo por causa do `server-only`).
export { MENSALIDADE } from './precos'
import { MENSALIDADE } from './precos'

export interface ClienteAsaas {
  id: string
}
export interface AssinaturaAsaas {
  id: string
  nextDueDate: string
}

async function chamar<T>(
  caminho: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  if (!KEY) throw new Error('ASAAS_API_KEY não configurada')

  const res = await fetch(`${BASE}${caminho}`, {
    method: init.method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_token: KEY,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  })

  const corpo = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok) {
    // O Asaas devolve {errors:[{code,description}]} — a descricao dele e melhor
    // que qualquer mensagem nossa ("CPF inválido", "cliente já possui...").
    const erros = (corpo?.errors as { description?: string }[] | undefined) || []
    const detalhe = erros.map((e) => e.description).filter(Boolean).join('; ')
    throw new Error(detalhe || `asaas respondeu ${res.status}`)
  }

  return corpo as T
}

/**
 * O customer, sem duplicar.
 *
 * `externalReference` = slug do consultor. Sem essa busca antes, um consultor
 * que tentasse contratar duas vezes (recarregou a pagina, o pagamento demorou)
 * viraria dois clientes e, pior, duas assinaturas cobrando R$ 80 cada.
 */
export async function garantirCliente(dados: {
  slug: string
  nome: string
  cpf: string
  email: string
  whatsapp: string
}): Promise<ClienteAsaas> {
  const busca = await chamar<{ data?: { id: string }[] }>(
    `/customers?externalReference=${encodeURIComponent(dados.slug)}`,
    { method: 'GET' },
  )
  const achado = busca.data?.[0]
  if (achado?.id) return { id: achado.id }

  return chamar<ClienteAsaas>('/customers', {
    method: 'POST',
    body: {
      name: dados.nome,
      cpfCnpj: dados.cpf,
      email: dados.email,
      mobilePhone: dados.whatsapp,
      externalReference: dados.slug,
      // O ponto do dinheiro: nos avisamos pelo Evolution, eles nao cobram nada.
      notificationDisabled: true,
    },
  })
}

/**
 * A assinatura mensal.
 *
 * `billingType: UNDEFINED` deixa o consultor escolher boleto ou Pix na hora de
 * pagar. Pix cai na hora e o site dele entra no ar no mesmo minuto; travar em
 * BOLETO faria todo mundo esperar um dia util sem motivo.
 */
export async function garantirAssinatura(
  clienteId: string,
  slug: string,
): Promise<AssinaturaAsaas> {
  const busca = await chamar<{ data?: { id: string; nextDueDate: string; status: string }[] }>(
    `/subscriptions?externalReference=${encodeURIComponent(slug)}`,
    { method: 'GET' },
  )
  const ativa = busca.data?.find((s) => s.status === 'ACTIVE')
  if (ativa) return { id: ativa.id, nextDueDate: ativa.nextDueDate }

  // Tres dias pra primeira: tempo de pagar um boleto sem que a cobranca ja
  // nasca vencida se ele preencher o formulario de madrugada.
  const venc = new Date()
  venc.setDate(venc.getDate() + 3)

  return chamar<AssinaturaAsaas>('/subscriptions', {
    method: 'POST',
    body: {
      customer: clienteId,
      billingType: 'UNDEFINED',
      value: MENSALIDADE,
      nextDueDate: venc.toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: `Site 21Go — 21go.com.br/${slug}`,
      externalReference: slug,
    },
  })
}

/**
 * A cobranca em aberto da assinatura: o link pra pagar e a data que ela vence.
 *
 * ⚠️ O vencimento tem que sair DAQUI, nunca do `nextDueDate` da assinatura.
 * Medido em 12/08/2026: assinatura criada com vencimento 15/08 ja nasce com
 * `nextDueDate = 15/09`, porque esse campo aponta pro proximo ciclo a gerar, e
 * nao pra cobranca que esta em aberto. Guardar o da assinatura faria o corte
 * por inadimplencia contar os 5 dias a partir do mes seguinte — ou seja, o
 * caloteiro ficaria um mes inteiro no ar de graca.
 */
export async function cobrancaEmAberto(
  assinaturaId: string,
): Promise<{ id: string | null; link: string | null; vencimento: string | null; status: string | null }> {
  return (await situacaoDeCobranca(assinaturaId)).aberta
}

const PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']

/**
 * Retrato de cobranca da assinatura numa unica ida ao Asaas: o que esta em
 * aberto e QUANDO foi o ultimo pagamento.
 *
 * A data do ultimo pagamento existe por causa da regra dos 30 dias (ordem do
 * dono, 17/08/2026): depois de pago, ninguem pode ser cobrado de novo antes de
 * 30 dias. Sem ela o sistema decidia "esta devendo" so por existir parcela
 * aberta — e em 17/08/2026 cobrou o hugoaguiar, que tinha pagado: o dinheiro
 * dele caiu na parcela de setembro e a de agosto continuou aberta.
 */
export async function situacaoDeCobranca(assinaturaId: string): Promise<{
  aberta: { id: string | null; link: string | null; vencimento: string | null; status: string | null }
  ultimoPagamentoEm: string | null
  /** A data que vale pra avisar e pra cortar — ver `vencimentoEfetivo`. */
  vencimentoEfetivo: string | null
}> {
  const r = await chamar<{
    data?: {
      id?: string
      invoiceUrl?: string
      dueDate?: string
      status?: string
      paymentDate?: string
      confirmedDate?: string
      clientPaymentDate?: string
    }[]
  }>(`/subscriptions/${encodeURIComponent(assinaturaId)}/payments`, { method: 'GET' })

  // ⚠️ A API devolve as cobrancas da MAIS NOVA pra mais antiga. Sem ordenar, um
  // `find` pega a do mes QUE VEM em vez da que vence agora — foi o que
  // aconteceu em 15/08/2026: o checkout mostrou o Pix de setembro, o consultor
  // pagou, e agosto continuou em aberto. Como este mesmo vencimento vira
  // `proximo_vencimento`, o corte por inadimplencia tambem passava a contar do
  // mes seguinte, dando um mes de graca pra quem nao paga.
  const porVencimento = (a: { dueDate?: string }, b: { dueDate?: string }) =>
    (a.dueDate || '').localeCompare(b.dueDate || '')

  const lista = (r.data || []).slice().sort(porVencimento)

  // ⚠️ Sem `|| lista[0]`, de proposito. Aquele fallback devolvia uma parcela JA
  // PAGA como se fosse a cobranca em aberto: em 21/08/2026 a Renata pagou e o
  // `proximo_vencimento` dela ficou gravado como 24/08 — a data da parcela que
  // ela acabara de quitar. Com o calendario de avisos contando a partir dessa
  // coluna, seria cobranca em data errada, que e justamente o que nao pode
  // acontecer. "Nao ha nada em aberto" tem que devolver nada.
  const aberta = lista.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE') || null

  // A data que vale e a do PAGAMENTO, nao a do vencimento: quem paga adiantado
  // ou atrasado tem que contar os 30 dias de quando o dinheiro entrou. Cai pro
  // vencimento so quando o Asaas nao devolve nenhuma das datas de pagamento.
  const ultimoPagamentoEm =
    lista
      .filter((p) => PAGOS.includes(p.status || ''))
      .map((p) => p.paymentDate || p.confirmedDate || p.clientPaymentDate || p.dueDate || '')
      .filter(Boolean)
      .sort()
      .pop() ?? null

  return {
    aberta: {
      id: aberta?.id ?? null,
      link: aberta?.invoiceUrl ?? null,
      vencimento: aberta?.dueDate ?? null,
      status: aberta?.status ?? null,
    },
    ultimoPagamentoEm,
    vencimentoEfetivo: vencimentoEfetivo(aberta?.dueDate ?? null, ultimoPagamentoEm),
  }
}

/**
 * A data que o consultor REALMENTE tem que pagar — a unica que pode disparar
 * aviso ou corte.
 *
 * E o mais TARDE entre a parcela aberta e "ultimo pagamento + 30 dias", porque
 * as duas coisas divergem na vida real. O caso que provou isso e o hugoaguiar:
 * ele pagou em 14/08/2026, mas o Pix caiu na parcela de 17/09 e a de 17/08
 * ficou OVERDUE pra sempre. Olhando so a parcela aberta, ele e um caloteiro de
 * um mes e leva corte; olhando o pagamento, ele esta em dia — e esta.
 *
 * Quem pagou tem 30 dias de site, ponto. Uma parcela velha que ficou aberta por
 * descasamento do Asaas nao pode cobrar de novo o mes que ja foi pago.
 */
export function vencimentoEfetivo(
  vencimentoAberto: string | null,
  ultimoPagamentoEm: string | null,
): string | null {
  if (!ultimoPagamentoEm) return vencimentoAberto
  const trintaDepois = new Date(`${ultimoPagamentoEm.slice(0, 10)}T00:00:00`)
  trintaDepois.setDate(trintaDepois.getDate() + 30)
  const pisoDoCiclo = trintaDepois.toISOString().slice(0, 10)
  if (!vencimentoAberto) return pisoDoCiclo
  return vencimentoAberto > pisoDoCiclo ? vencimentoAberto : pisoDoCiclo
}

/**
 * Pix e boleto pra montar o checkout DENTRO do nosso site.
 *
 * Regra do dono (12/08/2026): *"o checkout nao pode parecer que e Asaas"*. Por
 * isso nao mandamos ninguem pro `invoiceUrl` deles — pegamos o QR, o copia-e-
 * cola e a linha digitavel e desenhamos tudo com a marca 21Go. O consultor paga
 * sem nunca ver o nome do meio de campo.
 *
 * Funciona com `billingType: UNDEFINED` (medido em 12/08/2026): a mesma cobranca
 * devolve QR de Pix E linha digitavel de boleto, entao ele escolhe na hora sem
 * a gente ter que decidir por ele na criacao da assinatura.
 */
export async function dadosDeCobranca(pagamentoId: string): Promise<{
  pixCopiaECola: string | null
  pixQrBase64: string | null
  boletoLinha: string | null
}> {
  const [pix, boleto] = await Promise.all([
    chamar<{ success?: boolean; payload?: string; encodedImage?: string }>(
      `/payments/${encodeURIComponent(pagamentoId)}/pixQrCode`,
      { method: 'GET' },
    ).catch(() => null),
    chamar<{ identificationField?: string }>(
      `/payments/${encodeURIComponent(pagamentoId)}/identificationField`,
      { method: 'GET' },
    ).catch(() => null),
  ])

  return {
    pixCopiaECola: pix?.payload ?? null,
    pixQrBase64: pix?.encodedImage ?? null,
    boletoLinha: boleto?.identificationField ?? null,
  }
}

/** O status da cobranca, pra tela saber a hora de virar "pago". */
export async function statusDaCobranca(pagamentoId: string): Promise<string | null> {
  const r = await chamar<{ status?: string }>(`/payments/${encodeURIComponent(pagamentoId)}`, {
    method: 'GET',
  }).catch(() => null)
  return r?.status ?? null
}

/** Cancelamento definitivo: para de gerar cobranca nova. */
export async function cancelarAssinatura(assinaturaId: string): Promise<void> {
  await chamar(`/subscriptions/${encodeURIComponent(assinaturaId)}`, { method: 'DELETE' })
}

/**
 * O webhook esta entregando?
 *
 * ⚠️ Isto existe por um incidente real (12/08/2026). Um unico 401 — de uma
 * janela em que o token do painel e o do servidor divergiam — deixou o webhook
 * com `penalizedRequestsCount: 1`, e como o envio e SEQUENCIAL a fila inteira
 * parou atras dele. O sintoma foi cruel: nao chegava evento nenhum E nao havia
 * tentativa nos logs, entao do nosso lado parecia simplesmente "nada aconteceu".
 * Nada avisou; so descobrimos pelo e-mail que o Asaas mandou pro dono.
 *
 * Com a cobranca rodando sozinha, esse silencio pararia todo o faturamento sem
 * ninguem perceber. Por isso o cron diario confere e grita.
 */
export async function saudeDoWebhook(): Promise<{
  ok: boolean
  motivo: string | null
}> {
  const r = await chamar<{
    data?: { url?: string; enabled?: boolean; interrupted?: boolean; penalizedRequestsCount?: number }[]
  }>('/webhooks', { method: 'GET' })

  const nosso = (r.data || []).find((w) => (w.url || '').includes('/api/webhooks/asaas'))
  if (!nosso) return { ok: false, motivo: 'o webhook do site sumiu do Asaas' }
  if (!nosso.enabled) return { ok: false, motivo: 'o webhook está desativado' }
  if (nosso.interrupted) return { ok: false, motivo: 'a fila do webhook foi INTERROMPIDA' }
  if ((nosso.penalizedRequestsCount ?? 0) > 0) {
    return {
      ok: false,
      motivo: `o webhook tem ${nosso.penalizedRequestsCount} entrega(s) penalizada(s) — a fila trava atrás delas`,
    }
  }
  return { ok: true, motivo: null }
}
