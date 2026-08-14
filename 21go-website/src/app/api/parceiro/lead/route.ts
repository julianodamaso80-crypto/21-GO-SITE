import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Ponte pros sites que NAO sao nossos.
 *
 * Um consultor com site proprio (o primeiro caso: `21go.app`, do Gabriel) faz o
 * formulario dele bater aqui, e a cotacao nasce no PowerCRM atribuida a ele —
 * o mesmo caminho de `/api/vehicle/lead`, so que o site de origem e de fora.
 *
 * Por que a chamada ao Power acontece AQUI e nao la: o token da Power API e da
 * 21Go, nao do consultor. Mandar o token pra hospedagem de terceiro seria
 * espalhar credencial da empresa por lugares que a gente nao controla e nao
 * consegue revogar. Aqui ele nao sai de casa; o parceiro so precisa saber a
 * chave dele, que revogamos apagando uma linha.
 *
 * NAO envia PDF nem WhatsApp: o site do parceiro ja tem o atendimento dele.
 * Aqui e so a atribuicao no CRM.
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
const LEAD_SOURCE = Number(process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584')

/**
 * Quem pode usar esta porta. A chave fica no codigo (dos dois lados) de
 * proposito: o parceiro nao sabe mexer em variavel de ambiente da hospedagem
 * dele, e exigir isso trocaria uma barreira de verdade por um site que nunca
 * entra no ar. O que a chave protege e pequeno — permite criar cotacao no funil
 * do proprio parceiro, nada alem — e some com um deploy nosso.
 */
const PARCEIROS: Record<string, { chave: string; nome: string; powerlink: string }> = {
  '21goapp': {
    chave: '1f31905505bc033c80c4361c0dda6ae7',
    nome: 'Gabriel Juliano',
    powerlink: 'XDmAbx6D',
  },
}

interface Corpo {
  parceiro?: string
  chave?: string
  nome?: string
  whatsapp?: string
  placa?: string
  valorFipe?: number
}

export async function POST(req: NextRequest) {
  if (!POWERAPI_TOKEN) {
    console.error('[parceiro] POWERAPI_TOKEN nao configurado')
    return NextResponse.json({ error: 'indisponivel' }, { status: 503 })
  }

  const corpo = (await req.json().catch(() => null)) as Corpo | null
  const parceiro = corpo?.parceiro ? PARCEIROS[corpo.parceiro] : undefined
  if (!parceiro || parceiro.chave !== corpo?.chave) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  const name = (corpo.nome || '').trim()
  const phone = (corpo.whatsapp || '').replace(/\D/g, '')
  if (name.length < 2 || phone.length < 10) {
    return NextResponse.json({ error: 'nome ou whatsapp invalido' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    name,
    phone,
    leadSource: LEAD_SOURCE,
    // slsmnNwId, e nao pwrlnk: e ele que atribui o lead ao consultor. Com o
    // pwrlnk sozinho a cotacao nasce orfa e o Power arquiva sozinho.
    slsmnNwId: parceiro.powerlink,
  }
  if (corpo.placa) payload.plts = corpo.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (corpo.valorFipe) payload.protectedValue = corpo.valorFipe

  try {
    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Authorization: `Bearer ${POWERAPI_TOKEN}`,
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const quotationCode = (json?.quotationCode as string) || null

    console.log(
      `[parceiro] ${corpo.parceiro} -> ${parceiro.nome} (${parceiro.powerlink}) ` +
        `status ${res.status} cotacao ${quotationCode ?? 'sem codigo'}`,
    )

    return NextResponse.json({ ok: res.ok, quotationCode }, { status: res.ok ? 200 : 502 })
  } catch (err) {
    console.error('[parceiro] falha ao criar cotacao no Power', err)
    return NextResponse.json({ error: 'falha ao criar cotacao' }, { status: 502 })
  }
}
