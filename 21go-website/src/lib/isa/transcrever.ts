import 'server-only'

/**
 * Audio do cliente → texto, pelo OpenRouter (Gemini Flash-Lite aceita audio na entrada).
 * Ordem do dono: o modelo mais em conta que entregue qualidade. ~US$ 0,10 por milhao de tokens
 * de entrada; um audio de 30 s fica em ~1 mil tokens.
 *
 * O audio nunca e gravado: vira base64 so para esta chamada e vai embora.
 */

const MODELO = 'google/gemini-2.5-flash-lite'

function formatoDoMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('ogg') || m.includes('opus')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  if (m.includes('aac')) return 'aac'
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a'
  return 'ogg' // nota de voz do WhatsApp
}

export async function transcrever(bytes: Buffer, mime: string): Promise<string | null> {
  const chave = process.env.OPENROUTER_API_KEY
  if (!chave) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Transcreva este audio em portugues do Brasil, exatamente como foi falado. ' +
                  'E um cliente falando com uma empresa de protecao veicular no Rio de Janeiro: ' +
                  'nomes de carros e motos (Onix, HB20, Gol, Compass, Kwid, Titan, CG, Fazer, BYD), ' +
                  'placas e valores aparecem com frequencia — escreva-os do jeito certo. ' +
                  'Devolva so o texto transcrito, sem comentarios. Se nao houver fala, devolva vazio.',
              },
              { type: 'input_audio', input_audio: { data: bytes.toString('base64'), format: formatoDoMime(mime) } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      console.warn('[isa] transcricao HTTP', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return null
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const texto = j.choices?.[0]?.message?.content?.trim()
    return texto || null
  } catch (err) {
    console.warn('[isa] transcricao falhou:', err instanceof Error ? err.message : err)
    return null
  }
}
