/**
 * Vigia do BYD — o texto do aviso ao dono.
 *
 * BYD e a unica marca que recebe texto + PDF sozinha, pelo 4824. De 15/09 a 26/09/2026 o 4824
 * ficou "open" na Evolution sem passar nenhuma mensagem, e ~40 BYD ficaram sem nada — o dono so
 * soube quando um cliente reclamou. Dono: "byd tem que ter atencao redobrada".
 */

export interface LeadBydSemEnvio {
  nome: string | null
  telefone: string
  modelo: string | null
  ano: number | string | null
  plano: string | null
  valor: number | null
  criadoEm: Date
  clicouWhatsapp: boolean
}

function quandoNoRio(d: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`
}

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Uma mensagem por rodada, com todos os leads — chip caido gera varios de uma vez. */
export function textoAvisoByd(leads: LeadBydSemEnvio[], ultimaDo4824: Date | null): string {
  const linhas = leads.map((l) => {
    const carro = [l.modelo, l.ano].filter(Boolean).join(' ')
    const plano = l.plano ? ` · ${l.plano}${l.valor ? ` ${reais(l.valor)}` : ''}` : ''
    const clique = l.clicouWhatsapp ? ' · clicou no WhatsApp' : ''
    return `• ${l.nome || 'sem nome'} · ${l.telefone}\n  ${carro}${plano}\n  simulou ${quandoNoRio(l.criadoEm)}${clique}`
  })
  const ultima = ultimaDo4824 ? quandoNoRio(ultimaDo4824) : 'nenhuma nos últimos 2 dias'
  return [
    `🚨 BYD sem mensagem do 4824 (${leads.length})`,
    '',
    'Simulou BYD e em 15 min não saiu nada pra ele, nem o PDF automático, nem alguém da equipe:',
    '',
    ...linhas,
    '',
    `Última mensagem registrada no 4824: ${ultima}.`,
    'Se faz horas, o chip caiu na Evolution (aparece conectado e não passa nada): reiniciar o serviço sinistro-21go_evolution-api.',
  ].join('\n')
}
