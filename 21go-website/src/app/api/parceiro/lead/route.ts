import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@/lib/request-context'
import { gravarLeadDoParceiro } from '@/lib/parceiro-lead'
import { parceiroAutorizado } from '@/lib/parceiro.regras'

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
 * chave dele, que revogamos apagando uma linha (PARCEIROS, em parceiro.regras.ts).
 *
 * NAO envia PDF nem WhatsApp. Desde a Fase 4 da Mariana o lead tambem e gravado no
 * nosso banco como o site da casa grava (placa, planos e precos do Power), com o
 * dominio do parceiro: quem procura esse cliente e a Mariana, do container dela. A
 * cotacao no Power continua UMA so: a daqui.
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
const LEAD_SOURCE = Number(process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584')

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
  const parceiro = parceiroAutorizado(corpo?.parceiro, corpo?.chave)
  if (!parceiro || !corpo) {
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

  // Fora do await de proposito: a consulta da placa leva segundos e o site do parceiro nao
  // espera por ela. Falhar aqui nunca muda a resposta — a cotacao no Power ja foi feita.
  const ctx = getRequestContext(req)
  const gravar = (quotationCode: string | null, negotiationCode: string | null): void => {
    void gravarLeadDoParceiro({
      parceiro,
      nome: name,
      telefone: phone,
      placa: corpo.placa,
      valorFipe: corpo.valorFipe,
      quotationCode,
      negotiationCode,
      ctx,
    })
      .then((r) => console.log(`[parceiro] lead ${r.leadId} gravado (${r.consulta})`))
      .catch((err) => console.error('[parceiro] lead nao gravado no banco', err))
  }

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
    const negotiationCode = (json?.negotiationCode as string) || null

    console.log(
      `[parceiro] ${corpo.parceiro} -> ${parceiro.nome} (${parceiro.powerlink}) ` +
        `status ${res.status} cotacao ${quotationCode ?? 'sem codigo'}`,
    )

    gravar(quotationCode, negotiationCode)
    return NextResponse.json({ ok: res.ok, quotationCode }, { status: res.ok ? 200 : 502 })
  } catch (err) {
    console.error('[parceiro] falha ao criar cotacao no Power', err)
    gravar(null, null)
    return NextResponse.json({ error: 'falha ao criar cotacao' }, { status: 502 })
  }
}
