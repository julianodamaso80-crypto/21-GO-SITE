import 'server-only'
import { spawn } from 'node:child_process'

/**
 * Audio gravado no painel → ogg/opus, o unico formato que a Meta aceita como mensagem de VOZ
 * (as outras opcoes chegam como arquivo). O navegador grava webm/opus (Chrome, Android) ou
 * mp4/aac (iPhone): os dois entram aqui e saem iguais. Precisa do ffmpeg na imagem.
 *
 * Pedido do dono em 11/09/2026: "aqui eu tenho que conseguir responder com audio tbm se eu quiser".
 */

const TIMEOUT_MS = 30_000
const TAMANHO_MAXIMO = 16 * 1024 * 1024 // limite da Meta pra audio

export function ehOggOpus(mime: string): boolean {
  return /^audio\/(ogg|opus)/i.test(mime)
}

export async function paraOggOpus(bytes: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn', '-map_metadata', '-1',
      '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
      '-f', 'ogg', 'pipe:1',
    ])
    const partes: Buffer[] = []
    let erro = ''
    const fim = setTimeout(() => ff.kill('SIGKILL'), TIMEOUT_MS)

    ff.stdout.on('data', (d: Buffer) => partes.push(d))
    ff.stderr.on('data', (d: Buffer) => { erro += d.toString().slice(0, 300) })
    ff.on('error', (err) => {
      clearTimeout(fim)
      console.warn('[isa] ffmpeg nao rodou:', err.message)
      resolve(null)
    })
    ff.on('close', (code) => {
      clearTimeout(fim)
      const saida = Buffer.concat(partes)
      if (code !== 0 || saida.length === 0) {
        console.warn('[isa] conversao de audio falhou:', code, erro)
        resolve(null)
        return
      }
      resolve(saida.length > TAMANHO_MAXIMO ? null : saida)
    })

    ff.stdin.on('error', () => {}) // ffmpeg morreu antes de ler tudo
    ff.stdin.end(bytes)
  })
}
