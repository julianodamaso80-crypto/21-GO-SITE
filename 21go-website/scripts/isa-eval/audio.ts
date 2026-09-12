/**
 * Prova da transcrição de áudio: passa arquivos de voz pelo MESMO `transcrever()` de produção e
 * mostra o que a Isa "ouviria". Serve pra conferir que ela marca [INAUDIVEL] em vez de completar
 * frase cortada (dono, 12/09/2026: "verifique a IA de voz, pra ela não responder errado e não
 * alucinar").
 *
 *   node --import ./scripts/isa-eval/loader.mjs scripts/isa-eval/audio.ts caminho/a.wav caminho/b.ogg
 */
import { readFileSync } from 'node:fs'
import { extname, basename } from 'node:path'
import { transcrever } from '@/lib/isa/transcrever'
import { ehInaudivel } from '@/lib/isa/envio.regras'

try {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  /* chave pelo ambiente */
}

const MIME: Record<string, string> = { '.wav': 'audio/wav', '.ogg': 'audio/ogg; codecs=opus', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }

async function main() {
  for (const arquivo of process.argv.slice(2)) {
    const bytes = readFileSync(arquivo)
    const mime = MIME[extname(arquivo).toLowerCase()] ?? 'audio/ogg'
    const t0 = Date.now()
    const texto = await transcrever(bytes, mime)
    const seg = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n▶ ${basename(arquivo)} (${(bytes.length / 1024).toFixed(0)} KB, ${seg}s)`)
    console.log(`   transcrição: ${JSON.stringify(texto)}`)
    console.log(`   a Isa trata como: ${ehInaudivel(texto) ? 'NÃO ENTENDEU → pede pra repetir (sem IA)' : 'texto normal → responde'}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
