/**
 * "Esse número tem WhatsApp mesmo?" — perguntado ao WhatsApp, um por vez.
 *
 * O formato já foi conferido antes (ver `whatsapp-numero.ts`); aqui é a
 * pergunta que só o WhatsApp sabe responder. Serve a duas coisas: o cliente
 * descobre o erro de digitação enquanto ainda está na tela, e o chip não gasta
 * envio em número que não existe.
 *
 * ⚠️ UM POR VEZ, no submit — nunca em lote. Este endpoint da Evolution não tem
 * rate limit próprio, e varrer base com ele é caminho conhecido de ban
 * (evolution-api#2228). Uma consulta por lead é tráfego de gente normal;
 * varrer 900 leads de uma vez queima o número.
 *
 * Na dúvida, deixa passar: Evolution fora do ar não pode virar formulário
 * travado. Quem decide bloquear é uma resposta explícita de "não existe".
 */

import { CHIPS, chaveDo } from '@/lib/chips-recuperacao'

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'

const TIMEOUT_MS = 6000

export type ExistenciaWhatsApp = 'existe' | 'nao_existe' | 'indeterminado'

/** A instância que pergunta. Nunca a de atendimento — ver chips-recuperacao. */
function instanciaConsulta(seed: number): { instancia: string; chave: string } | null {
  const comChave = CHIPS.filter((c) => chaveDo(c))
  if (comChave.length === 0) return null
  const chip = comChave[seed % comChave.length]
  return { instancia: chip.instancia, chave: chaveDo(chip) }
}

export async function numeroExisteNoWhatsApp(
  telefoneComDDI: string,
): Promise<ExistenciaWhatsApp> {
  const conta = instanciaConsulta(Math.floor(Math.random() * 1000))
  if (!conta) {
    console.warn('[wa-existe] nenhum chip com chave configurada — deixando passar')
    return 'indeterminado'
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/chat/whatsappNumbers/${conta.instancia}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: conta.chave },
        body: JSON.stringify({ numbers: [telefoneComDDI] }),
        signal: ctrl.signal,
      },
    )
    if (!res.ok) {
      console.warn('[wa-existe] Evolution respondeu', res.status)
      return 'indeterminado'
    }
    const data = (await res.json()) as unknown
    if (!Array.isArray(data) || data.length === 0) return 'indeterminado'

    const item = data[0] as { exists?: boolean }
    if (typeof item?.exists !== 'boolean') return 'indeterminado'
    return item.exists ? 'existe' : 'nao_existe'
  } catch (err) {
    console.warn(
      '[wa-existe] falhou (deixando passar):',
      err instanceof Error ? err.message : err,
    )
    return 'indeterminado'
  } finally {
    clearTimeout(timer)
  }
}
