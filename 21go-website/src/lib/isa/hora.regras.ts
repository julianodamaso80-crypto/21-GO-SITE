/**
 * Hora da Isa — sempre a do Rio de Janeiro, calculada aqui.
 *
 * Nunca pelo relogio do container (o host grava em UTC) nem deixando a IA "saber" que horas
 * sao: o dono pediu explicitamente para nao dar "boa tarde" de manha. O Rio e UTC-3 fixo desde
 * que o horario de verao acabou (2019), mas a conta passa pelo Intl mesmo assim.
 */

export type Cumprimento = 'bom dia' | 'boa tarde' | 'boa noite'

const ABRE = 8
const FECHA = 22

function horaMinutoRio(d: Date): { h: number; m: number; ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value)
  return { h: v('hour'), m: v('minute'), ano: v('year'), mes: v('month'), dia: v('day') }
}

/** bom dia 05:00–11:59 · boa tarde 12:00–17:59 · boa noite 18:00–04:59 */
export function cumprimento(agora: Date): Cumprimento {
  const { h } = horaMinutoRio(agora)
  if (h >= 5 && h < 12) return 'bom dia'
  if (h >= 12 && h < 18) return 'boa tarde'
  return 'boa noite'
}

/** A Isa atende das 8h as 22h. Fora disso ela silencia e responde a fila as 8h. */
export function dentroDoHorario(agora: Date): boolean {
  const { h } = horaMinutoRio(agora)
  return h >= ABRE && h < FECHA
}

/**
 * Cumprimenta no comeco da conversa, no primeiro contato do dia (no Rio) e depois de 4 h sem
 * falar. No meio da conversa, "boa tarde" a cada mensagem soa robo.
 */
export function precisaCumprimentar(ultimaRespostaEm: Date | null, agora: Date): boolean {
  if (!ultimaRespostaEm) return true
  const a = horaMinutoRio(ultimaRespostaEm)
  const b = horaMinutoRio(agora)
  if (a.ano !== b.ano || a.mes !== b.mes || a.dia !== b.dia) return true
  return agora.getTime() - ultimaRespostaEm.getTime() > 4 * 60 * 60 * 1000
}

/** Quando a Isa pode falar de novo: agora, se esta no horario; senao, as 8h (hoje ou amanha). */
export function proximaAbertura(agora: Date): Date {
  if (dentroDoHorario(agora)) return agora
  const { h, ano, mes, dia } = horaMinutoRio(agora)
  // 08:00 no Rio = 11:00 UTC. Date.UTC normaliza a virada de mes/ano sozinho.
  const somaDia = h >= FECHA ? 1 : 0
  return new Date(Date.UTC(ano, mes - 1, dia + somaDia, ABRE + 3, 0, 0))
}
