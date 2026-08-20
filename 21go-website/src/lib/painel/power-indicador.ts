import 'server-only'
import { resolverConsultor, estaNoAr } from '../consultor'

/**
 * O indicador tambem nasce no Power do consultor.
 *
 * Ordem do dono (20/08/2026): *"o cara indicou alguem pelo site, tem q cair no
 * Power do Anderson quem indica e quem preenche"*. Quem preenche ja caia — e o
 * lead da cotacao. Quem INDICA nao existia em lugar nenhum fora do nosso banco,
 * entao o consultor nao tinha como falar com a propria rede pelo sistema que
 * ele usa todo dia.
 *
 * Nasce com nota `INDICADOR` no campo interno pra ele separar de cliente: e
 * gente pra ativar e cobrar indicacao, nao gente pra cotar.
 */

const BASE = process.env.POWERCRM_BASE_URL
const TOKEN = process.env.POWERAPI_TOKEN
const LEAD_SOURCE = process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584'

export async function criarIndicadorNoPower(dados: {
  consultorSlug: string
  nome: string
  whatsapp: string
  email: string
}): Promise<{ ok: boolean; quotationCode?: string }> {
  if (!TOKEN || !BASE) return { ok: false }

  const consultor = await resolverConsultor(dados.consultorSlug)
  if (!consultor || !estaNoAr(consultor)) return { ok: false }

  const cabecalho = {
    accept: 'application/json',
    Authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
  }

  try {
    const res = await fetch(`${BASE}/api/quotation/add`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify({
        name: dados.nome,
        phone: dados.whatsapp.replace(/\D/g, ''),
        email: dados.email || undefined,
        leadSource: Number(LEAD_SOURCE),
        // Sem isto o cadastro nasce no dono do token de integracao, nao no
        // consultor — o mesmo cuidado do lead de cotacao.
        slsmnNwId: consultor.powerlinkId,
      }),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const quotationCode = json?.quotationCode as string | undefined
    if (!quotationCode) return { ok: false }

    // `noteContractInternal` e o campo que aparece de fato na leitura — o
    // `noteContract` some (medido em 12/08/2026).
    await fetch(`${BASE}/api/quotation/update`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify({
        code: quotationCode,
        noteContractInternal: `INDICADOR — cadastrou-se para divulgar. Link: 21go.com.br/${dados.consultorSlug}`,
      }),
    }).catch(() => {})

    console.log(`[indicador] ${dados.nome} criado no Power de ${consultor.nome} (${quotationCode})`)
    return { ok: true, quotationCode }
  } catch (err) {
    // Cadastro no painel NAO pode falhar porque o Power caiu: a pessoa ja
    // digitou tudo e o link dela e o que importa. O Power e complemento.
    console.error('[indicador] falha ao criar no Power:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}
