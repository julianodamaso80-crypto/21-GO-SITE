/**
 * Os chips que falam com o lead que simulou e não clicou em "Quero contratar".
 *
 * ─── Por que não é o chip do site ────────────────────────────────────────────
 *
 * `site4824` é o número que ATENDE quem clica. Se ele também fizesse a
 * abordagem fria, um bloqueio de quem não gostou da mensagem derrubaria o
 * número que recebe todo mundo que clicou — o canal que funciona. Abordagem
 * fria e atendimento moram em chips diferentes de propósito.
 *
 * ─── Os limites não são decoração ────────────────────────────────────────────
 *
 * O que o WhatsApp pesa em 2026 é comportamento, não a biblioteca: taxa de
 * bloqueio, proporção de resposta, distância no grafo de contatos e
 * regularidade robótica de horário. Daí a janela comercial, o teto por dia com
 * rampa de aquecimento, o intervalo aleatório e o disjuntor por falha.
 *
 * `Leticya_Boletos` tinha 348 mensagens no histórico quando entrou aqui — é
 * chip praticamente novo, e número novo é o que mais cai nos primeiros dias.
 * Por isso a rampa vale por chip, contada a partir da entrada dele nesta rota.
 */

/** Um chip do rodízio. A chave nunca fica no repositório. */
export interface ChipRecuperacao {
  /** Nome da instância na Evolution. */
  instancia: string
  /** Só pra log e diagnóstico — quem assina a mensagem. */
  numero: string
  /** Env que guarda a chave da instância. */
  envChave: string
  /** Dia em que o chip entrou nesta rota (ISO). Base da rampa de aquecimento. */
  entrouEm: string
  /**
   * Chip com histórico real de conversa já está aquecido — a rampa não se
   * aplica. `disparo_xHH2aIEs_site21go` tem 84 mil mensagens e manda mais de
   * cem por dia no atendimento normal; tratá-lo como número novo só deixaria
   * lead sem resposta. Chip novo (`Leticya_Boletos`, 348 mensagens) sobe pela
   * rampa, que é onde o risco de verdade mora.
   */
  aquecido: boolean
}

export const CHIPS: ChipRecuperacao[] = [
  {
    instancia: 'disparo_xHH2aIEs_site21go',
    numero: '5521980214882',
    envChave: 'EVOLUTION_KEY_DISPARO',
    entrouEm: '2026-09-09',
    aquecido: true,
  },
  {
    instancia: 'Leticya_Boletos',
    numero: '5521969620781',
    envChave: 'EVOLUTION_KEY_BOLETOS',
    entrouEm: '2026-09-09',
    aquecido: false,
  },
]

export function chaveDo(chip: ChipRecuperacao): string {
  return process.env[chip.envChave] || ''
}

/* ───────────────── O dia, pro teto diário ───────────────── */

/** Data de Brasília no formato AAAA-MM-DD — a chave do teto diário. */
export function diaDeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

/* ───────────────── Rampa de aquecimento ───────────────── */

/**
 * Quantas mensagens este chip pode mandar hoje.
 * Sobe devagar: o peso do risco está nos primeiros dias de um número novo.
 */
export function tetoDiario(chip: ChipRecuperacao, agora = new Date()): number {
  if (chip.aquecido) return TETO_CHIP_AQUECIDO
  const inicio = new Date(`${chip.entrouEm}T00:00:00-03:00`).getTime()
  const dias = Math.floor((agora.getTime() - inicio) / 86_400_000)
  if (dias < 0) return 0
  if (dias < 3) return 8
  if (dias < 7) return 15
  return 30
}

/**
 * Teto de um chip já aquecido. Dimensionado pela demanda real: ~21 leads por
 * dia entram no alcance, e o dono quer falar com todos. A folga cobre o pico
 * sem virar disparo em massa.
 */
export const TETO_CHIP_AQUECIDO = 45

/* ───────────────── Ritmo ───────────────── */

/** Quantos leads no máximo por execução do cron (roda de 5 em 5 minutos). */
export const LOTE_POR_EXECUCAO = 3

/** Intervalo entre dois envios da mesma execução, em milissegundos. */
export const INTERVALO_MIN_MS = 30_000
export const INTERVALO_MAX_MS = 90_000

/** Falhas seguidas no mesmo chip antes de tirá-lo desta rodada. */
export const FALHAS_ATE_DESLIGAR = 3
