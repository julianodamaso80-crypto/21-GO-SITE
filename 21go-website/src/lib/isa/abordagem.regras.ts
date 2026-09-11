/**
 * Mensagem dos 5 min (Isa, fase 6): quem simulou no site da casa, nao clicou em nada e sumiu
 * recebe o template `simulacao_concluida_isa` (UTILITY, sem palavra de oferta). O desconto de
 * R$ 50 so aparece depois, quando o cliente toca num botao e a janela de 24 h abre. Logica pura.
 *
 * O primeiro texto ("separei um resumo do que o seu plano cobre. Toque abaixo pra ver 👇",
 * `simulacao_pronta_isa`) foi reclassificado pela Meta como MARKETING ainda na analise, em
 * 10/09/2026 — o dono quer so utilidade. O texto atual e de atualizacao da transacao, sem convite.
 */

import type { PlanoFatos } from './fatos.regras'

type PlanoResumo = Pick<PlanoFatos, 'id' | 'nome' | 'mensal' | 'cobre'>

export const TEMPLATE_5MIN = 'simulacao_concluida_isa'
export const PAYLOAD_COBRE = 'isa-5min:cobre'
export const PAYLOAD_DUVIDA = 'isa-5min:duvida'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** 55 + DDD + numero. O formulario grava com o 55; lead antigo pode vir sem. */
export function telefoneDeAbordagem(t: string | null | undefined): string | null {
  const d = (t || '').replace(/\D/g, '')
  const com55 = /^\d{10,11}$/.test(d) ? `55${d}` : d
  return /^55\d{10,11}$/.test(com55) ? com55 : null
}

const capitalizar = (p: string) => (/^\p{L}+$/u.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p)
// Sigla curta do veiculo fica como veio: CG, BMW, HB20 — "Cg" e "Bmw" parecem erro.
const palavraDoVeiculo = (p: string) => (p.length <= 3 ? p : capitalizar(p))

/** [primeiro nome, veiculo curto] — sem nome ou sem veiculo nao manda (o template ficaria torto). */
export function variaveisDoTemplate(l: {
  nome: string | null
  marca: string | null
  modelo: string | null
  ano: number | null
}): [string, string] | null {
  const nome = (l.nome || '').trim().split(/\s+/)[0]
  if (!nome || nome.length < 2 || !l.modelo?.trim()) return null
  const modelo = l.modelo.trim().split(/\s+/).slice(0, 2).map(palavraDoVeiculo).join(' ')
  const veiculo = [l.marca ? palavraDoVeiculo(l.marca.trim()) : '', modelo, l.ano ? String(l.ano) : ''].filter(Boolean).join(' ')
  return [capitalizar(nome), veiculo]
}

/** O que fica gravado no painel — o mesmo texto do template aprovado na Meta. */
export function textoDoTemplate([nome, veiculo]: [string, string]): string {
  return (
    `Simulação concluída\n\nOlá, ${nome}. Aqui é a Isa, da 21Go.\n` +
    `A simulação que você fez para o ${veiculo} foi concluída e o resultado ficou registrado.\n` +
    'Se quiser, envio por aqui o detalhamento do plano simulado.\n\n' +
    '[Ver detalhamento] [Tenho uma dúvida]'
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** O plano que o cliente escolheu na tela (cotacao_plano); se nao bater, o de referencia (VIP). */
export function planoDoCliente<T extends PlanoResumo>(planos: T[], escolhido: string | null): T | null {
  if (planos.length === 0) return null
  const achado = escolhido ? planos.find((p) => norm(p.nome) === norm(escolhido)) : undefined
  if (achado) return achado
  const ordem = ['vip', 'suv', 'moto-1000', 'moto-400', 'especial', 'premium', 'do-seu-jeito', 'basico']
  return ordem.map((id) => planos.find((p) => p.id === id)).find((p): p is T => !!p) ?? planos[0]
}

export function mensagemCobertura(p: { abertura: string | null; plano: PlanoResumo; pdfUrl: string }): string {
  const linhas: string[] = []
  if (p.abertura) linhas.push(p.abertura, '')
  linhas.push(`o seu plano ${p.plano.nome} (${brl(p.plano.mensal)}/mês) cobre:`, '')
  for (const b of p.plano.cobre) linhas.push(`✅ ${b}`)
  linhas.push('', `o PDF com todos os detalhes tá aqui 👇\n${p.pdfUrl}`)
  return linhas.join('\n')
}

export function mensagemDuvida(abertura: string | null): string {
  const t = 'claro, me conta qual é a sua dúvida 😃'
  return abertura ? `${abertura}\n\n${t}` : t
}

/** So manda template aprovado E de utilidade — marketing nunca sai, mesmo que a Meta aprove. */
export function templatePodeSair(t: { status: string | null; categoria: string | null }): boolean {
  return t.status === 'APPROVED' && t.categoria === 'UTILITY'
}

/** quality_rating da Meta: GREEN, YELLOW, RED (UNKNOWN em numero novo). */
export function qualidadeRuim(rating: string | null | undefined): boolean {
  const r = (rating || '').toUpperCase()
  return r === 'YELLOW' || r === 'RED'
}
