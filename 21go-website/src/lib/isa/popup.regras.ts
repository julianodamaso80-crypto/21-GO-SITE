/**
 * Popup de saida da tela de planos — quando pode aparecer e o que ele manda. Logica pura.
 *
 * Dono, 10/09/2026: aparece pra quem vai sair SEM clicar em "Quero contratar"; NAO fala valor
 * ("fale com um dos nossos consultores e ganhe um desconto na sua ativacao"); o botao abre o
 * WhatsApp da Isa com a mensagem pronta "Quero meu desconto" + os dados da simulacao. Os R$ 50
 * sao a Isa que da, do outro lado.
 *
 * Travas: so nos dois .site da casa, nunca em site de consultor (REGRA 0.1 — lead do consultor e
 * do consultor), uma vez por simulacao, e so com a chave ISA_POPUP ligada no servidor.
 */

export const DOMINIOS_DA_CASA = ['21go.site', '21goconsultoraleticya.site']
const NUMERO_ISA = '5521980040964'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ehDominioDaCasa(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return DOMINIOS_DA_CASA.includes(h)
}

export function podeMostrarPopup(p: {
  ligado: boolean
  hostname: string
  temConsultor: boolean
  clicouContratar: boolean
  jaViu: boolean
  temPlanos: boolean
}): boolean {
  return p.ligado && ehDominioDaCasa(p.hostname) && !p.temConsultor && !p.clicouContratar && !p.jaViu && p.temPlanos
}

export function mensagemDoPopup(p: {
  nome: string
  veiculo: string
  fipe: number | null
  plano: string | null
  mensal: number | null
  ativacao: number | null
  pdfUrl: string | null
}): string {
  const linhas = ['Quero meu desconto! 🙂', `Nome: ${p.nome.trim()}`, `Veículo: ${p.veiculo}`]
  if (p.fipe) linhas.push(`FIPE: ${brl(p.fipe)}`)
  if (p.plano && p.mensal) linhas.push(`Plano: ${p.plano} · ${brl(p.mensal)}/mês`)
  if (p.ativacao) linhas.push(`Ativação: ${brl(p.ativacao)}`)
  if (p.pdfUrl) linhas.push(`Minha simulação: ${p.pdfUrl}`)
  return linhas.join('\n')
}

export function linkDoPopup(mensagem: string): string {
  return `https://wa.me/${NUMERO_ISA}?text=${encodeURIComponent(mensagem)}`
}
