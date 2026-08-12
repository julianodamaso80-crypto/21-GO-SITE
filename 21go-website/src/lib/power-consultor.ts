import 'server-only'

/**
 * Quem e o consultor, segundo o Power.
 *
 * O e-mail e a chave: `/api/consultant/powerlink` devolve o PowerLink (o que faz
 * a cotacao nascer no nome dele), o nome e o telefone que ELE ja tem cadastrado
 * la. Isso importa porque o Power e a fonte da verdade — o que o consultor
 * digita no nosso formulario e so uma alegacao ate bater com isto.
 */

const BASE = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const TOKEN = process.env.POWERAPI_TOKEN

export interface ConsultorNoPower {
  powerlinkId: string
  nome: string
  email: string
  telefone: string
}

/** So os digitos: "(21) 97405-9280" e "21974059280" tem que comparar igual. */
export function soDigitos(v: string): string {
  return (v || '').replace(/\D/g, '')
}

/**
 * Compara dois telefones brasileiros ignorando o que varia sem mudar o numero:
 * DDI 55 na frente e o nono digito do celular.
 *
 * O nono digito e o caso real: o Power tem cadastro antigo com "(21) 7405-9280"
 * e a pessoa digita "(21) 97405-9280". Sao o mesmo telefone, e recusar a venda
 * por causa disso seria recusar gente legitima.
 */
export function mesmoTelefone(a: string, b: string): boolean {
  const nu = (v: string) => {
    let d = soDigitos(v)
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
    // Guarda DDD + os 8 ultimos: cobre com e sem nono digito de uma vez.
    return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d
  }
  const x = nu(a)
  return x.length >= 10 && x === nu(b)
}

/**
 * ⚠️ 404 aqui e resposta definitiva ("nao tem PowerLink"), nao rajada — isso foi
 * medido no CRM em 10/08/2026 com controles conhecidos intercalados. Entao a
 * retentativa abaixo e so pra erro de rede/timeout; repetir um 404 e queimar
 * chamada e fazer o consultor esperar a toa.
 */
export async function buscarConsultorNoPower(email: string): Promise<ConsultorNoPower | null> {
  if (!TOKEN) throw new Error('POWERAPI_TOKEN não configurado')

  const alvo = email.trim().toLowerCase()
  if (!alvo) return null

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(`${BASE}/api/consultant/powerlink`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ email: alvo }),
        signal: AbortSignal.timeout(20_000),
      })

      // Nao tem PowerLink: definitivo, nao insiste.
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`power respondeu ${res.status}`)

      const r = (await res.json()) as Record<string, unknown>
      const powerlinkId = String(r.powerlinkId ?? '').trim()
      if (!powerlinkId) return null

      return {
        powerlinkId,
        nome: String(r.name ?? '').trim(),
        // O Power devolve o e-mail com a grafia que ELE tem ("CARLOSALBERTO@...").
        // Guardamos a dele, nao a digitada, pra bater na hora de auditar.
        email: String(r.email ?? alvo).trim(),
        telefone: String(r.phone ?? '').trim(),
      }
    } catch (err) {
      if (tentativa === 3) {
        console.error('[power] powerlink falhou', alvo, (err as Error).message)
        throw err
      }
      await new Promise((r) => setTimeout(r, 1200 * tentativa))
    }
  }
  return null
}

/**
 * O nome como o consultor se reconhece, sem entregar a base pra quem esta
 * pescando: "Anderson Carneiro" -> "Anderson C.".
 *
 * Sem isso o endpoint de verificacao viraria um jeito de descobrir o nome
 * completo de qualquer consultor a partir de um e-mail chutado.
 */
export function nomeMascarado(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`
}

/** "(21) 97405-9280" -> "(21) *****-9280". */
export function telefoneMascarado(telefone: string): string {
  const d = soDigitos(telefone)
  if (d.length < 6) return ''
  const ddd = d.length >= 10 ? d.slice(0, 2) : ''
  return `(${ddd}) *****-${d.slice(-4)}`
}
