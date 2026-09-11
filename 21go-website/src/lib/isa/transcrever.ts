import 'server-only'

/**
 * Audio do cliente → texto, pelo OpenRouter.
 * Dono (11/09/2026): "use uma llm melhor se essa tiver alucinando". Comparados nos audios reais do
 * teste: o 2.5 Flash inventava ("nada de Alex"), o Lite trocava o sentido ("eu to entendendo" no
 * lugar de "eu NAO to entendendo"); o 3.1 Pro transcreve o que ouviu e marca o resto. Com
 * raciocinio baixo: 8-14 s e ~US$ 0,01 por audio.
 *
 * O audio nunca e gravado: vira base64 so para esta chamada e vai embora.
 */

// O OpenRouter passa pro seguinte da lista se o primeiro falhar (o Pro ainda e preview).
const MODELOS = ['google/gemini-3.1-pro-preview', 'google/gemini-3.8-flash']

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
        models: MODELOS,
        reasoning: { effort: 'low' },
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                // SEM lista de nomes de carro: no teste de 11/09/2026 o audio cortado virou "um Onix"
                // e depois "Kwid" — os dois estavam na lista de exemplos. Na duvida, [INAUDIVEL].
                text:
                  'Transcreva este audio em portugues do Brasil, exatamente como foi falado. ' +
                  'NAO complete frases, NAO corrija e NAO adivinhe palavras que nao ficaram claras. ' +
                  'Se uma palavra ou trecho nao ficou claro, escreva [INAUDIVEL] no lugar dele. ' +
                  'Se nao der pra entender nada (cortado, sem fala, so ruido), responda exatamente [INAUDIVEL]. ' +
                  'Devolva so o texto transcrito, sem comentarios.',
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
