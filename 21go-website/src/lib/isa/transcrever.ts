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

// Tenta na ordem: o Pro (o mais fiel) e, se ele falhar ou demorar, o 3.8 Flash.
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

const PROMPT =
  'Transcreva este audio em portugues do Brasil, exatamente como foi falado. ' +
  'NAO complete frases, NAO corrija e NAO adivinhe palavras que nao ficaram claras. ' +
  'Se uma palavra ou trecho nao ficou claro, escreva [INAUDIVEL] no lugar dele. ' +
  'Se nao der pra entender nada (cortado, sem fala, so ruido), responda exatamente [INAUDIVEL]. ' +
  'Devolva so o texto transcrito, sem comentarios.'

// Cada modelo tem o seu tempo: no teste de 11/09/2026 o Pro passou de 45 s num audio e ele
// virou "nao deu pra entender" — a reserva do OpenRouter so entra em erro, nao em demora.
const TEMPO_POR_MODELO_MS = 25_000

async function tentar(chave: string, modelo: string, bytes: Buffer, mime: string): Promise<string | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      reasoning: { effort: 'low' },
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            // SEM lista de nomes de carro: no teste de 11/09/2026 o audio cortado virou "um Onix"
            // e depois "Kwid" — os dois estavam na lista de exemplos. Na duvida, [INAUDIVEL].
            { type: 'text', text: PROMPT },
            { type: 'input_audio', input_audio: { data: bytes.toString('base64'), format: formatoDoMime(mime) } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TEMPO_POR_MODELO_MS),
  })
  if (!res.ok) {
    console.warn('[isa] transcricao HTTP', modelo, res.status, (await res.text().catch(() => '')).slice(0, 200))
    return null
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content?.trim() || null
}

export async function transcrever(bytes: Buffer, mime: string): Promise<string | null> {
  const chave = process.env.OPENROUTER_API_KEY
  if (!chave) return null
  for (const modelo of MODELOS) {
    try {
      const texto = await tentar(chave, modelo, bytes, mime)
      if (texto) return texto
    } catch (err) {
      console.warn('[isa] transcricao falhou:', modelo, err instanceof Error ? err.message : err)
    }
  }
  return null
}
