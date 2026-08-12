import 'server-only'

/**
 * A prova de que o site do consultor entrega o lead no Power DELE.
 *
 * Regra do dono (12/08/2026): *"o link so pode ser enviado pra ele no WhatsApp
 * depois que voce tiver certeza que caiu no daquela pessoa. Fora isso voce nao
 * pode enviar. Ai voce tem que arrumar ate cair no Power ideal"*.
 *
 * Por que isso nao e paranoia: o consultor paga R$ 80 por mes e ainda gasta do
 * proprio bolso com anuncio apontando pro link. Se o PowerLink estiver errado,
 * cada lead que ele comprar nasce no nome de outra pessoa — ele paga pra dar
 * cliente pra um concorrente interno e so descobre quando reclama. Mandar o link
 * sem provar seria empurrar esse risco pra ele.
 *
 * ─── Como a prova funciona ──────────────────────────────────────────────────
 *
 * 1. Cria uma cotacao de verdade no Power com `slsmnNwId = powerlinkId` dele.
 * 2. Le a negociacao que nasceu.
 * 3. Confere `responsibleId` (tem que ser o powerlink) E `responsible` (tem que
 *    ser o nome dele). Os dois, nao um ou outro.
 *
 * ⚠️ O passo 2 e o que vale. O retorno do `/quotation/add` apenas ECOA o
 * `slsmnNwId` que voce mandou — ele diz o que voce pediu, nao o que o Power
 * fez. Confiar nele daria "teste passou" mesmo com a atribuicao falhando.
 *
 * ⚠️ A cotacao de teste NAO tem como ser apagada: `/api/quotation/{code}` e
 * `/api/negotiation/{code}` respondem 405 no DELETE. Por isso o nome dela grita
 * que e teste — ela vai ficar no funil do consultor pra sempre.
 */

const BASE = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const TOKEN = process.env.POWERAPI_TOKEN

/** Telefone obviamente falso: ninguem vai ligar pra este numero por engano. */
const TELEFONE_FALSO = '21999999999'

export interface ResultadoTeste {
  ok: boolean
  negotiationCode: string | null
  responsavel: string | null
  responsavelId: string | null
  motivo: string | null
}

function headers(): Record<string, string> {
  if (!TOKEN) throw new Error('POWERAPI_TOKEN não configurado')
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  }
}

/**
 * Compara nomes tolerando o que varia sem ser pessoa diferente: acento, caixa e
 * espaco duplo. NAO tolera abreviacao — "CARLOS A R JUNIOR" e o que o Power tem,
 * e e contra o Power que comparamos (o mesmo campo, das duas pontas).
 */
function mesmoNome(a: string, b: string): boolean {
  const nu = (v: string) =>
    (v || '')
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  return nu(a) === nu(b) && nu(a).length > 0
}

export async function testarPowerlink(dados: {
  slug: string
  powerlinkId: string
  nome: string
}): Promise<ResultadoTeste> {
  const vazio: ResultadoTeste = {
    ok: false,
    negotiationCode: null,
    responsavel: null,
    responsavelId: null,
    motivo: null,
  }

  // ─── 1. cria a cotacao de teste ──────────────────────────────────────────
  let negotiationCode: string
  try {
    const res = await fetch(`${BASE}/api/quotation/add`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        // Grita que e teste: esta cotacao nao tem como ser apagada e vai ficar
        // no funil dele. Quem bater o olho tem que saber na hora que nao e lead.
        name: `TESTE 21GO NAO ATENDER (${dados.slug})`,
        phone: TELEFONE_FALSO,
        slsmnNwId: dados.powerlinkId,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return { ...vazio, motivo: `o Power recusou a cotação de teste (${res.status})` }

    const r = (await res.json()) as Record<string, unknown>
    // O Power devolve as duas grafias; `negotationCode` (sem o "i") e a antiga.
    negotiationCode = String(r.negotiationCode ?? r.negotationCode ?? '').trim()
    if (!negotiationCode) {
      return { ...vazio, motivo: 'o Power criou a cotação mas não devolveu a negociação' }
    }
  } catch (err) {
    return { ...vazio, motivo: `não consegui falar com o Power: ${(err as Error).message}` }
  }

  // ─── 2. le de volta: e AQUI que a atribuicao se prova ────────────────────
  try {
    const res = await fetch(`${BASE}/api/negotiation/${encodeURIComponent(negotiationCode)}`, {
      method: 'GET',
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      return { ...vazio, negotiationCode, motivo: `não consegui ler a negociação (${res.status})` }
    }

    const n = (await res.json()) as Record<string, unknown>
    const responsavelId = String(n.responsibleId ?? '').trim()
    const responsavel = String(n.responsible ?? '').trim()

    if (!responsavelId) {
      return {
        ...vazio,
        negotiationCode,
        responsavel,
        motivo: 'a cotação nasceu SEM DONO — ela cairia na distribuição automática do Power',
      }
    }
    if (responsavelId !== dados.powerlinkId) {
      return {
        ok: false,
        negotiationCode,
        responsavel,
        responsavelId,
        motivo: `a cotação caiu em OUTRO consultor (${responsavel || responsavelId})`,
      }
    }
    if (!mesmoNome(responsavel, dados.nome)) {
      // PowerLink certo mas nome diferente: o cadastro do Power mudou de dono,
      // ou gravamos o nome errado na venda. Nos dois casos, alguem tem que olhar.
      return {
        ok: false,
        negotiationCode,
        responsavel,
        responsavelId,
        motivo: `o PowerLink confere, mas está no nome de "${responsavel}" e não de "${dados.nome}"`,
      }
    }

    return { ok: true, negotiationCode, responsavel, responsavelId, motivo: null }
  } catch (err) {
    return {
      ...vazio,
      negotiationCode,
      motivo: `não consegui conferir a negociação: ${(err as Error).message}`,
    }
  }
}
