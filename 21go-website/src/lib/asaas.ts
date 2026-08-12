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

/** R$ 80,00/mes. Um lugar so — o formulario e a assinatura leem daqui. */
export const MENSALIDADE = 80

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
): Promise<{ link: string | null; vencimento: string | null }> {
  const r = await chamar<{ data?: { invoiceUrl?: string; dueDate?: string; status?: string }[] }>(
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments`,
    { method: 'GET' },
  )
  const lista = r.data || []
  const aberta = lista.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE') || lista[0]
  return { link: aberta?.invoiceUrl ?? null, vencimento: aberta?.dueDate ?? null }
}

/** Cancelamento definitivo: para de gerar cobranca nova. */
export async function cancelarAssinatura(assinaturaId: string): Promise<void> {
  await chamar(`/subscriptions/${encodeURIComponent(assinaturaId)}`, { method: 'DELETE' })
}
