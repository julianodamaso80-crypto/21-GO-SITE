// Renderiza cada página de um PDF como PNG separado.
// Usa o próprio Chromium do puppeteer-core já configurado.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs/promises'
import path from 'node:path'

const PDF = process.argv[2] || 'C:/tmp/preview-21go.pdf'
const OUT_DIR = process.argv[3] || 'C:/tmp/pdf-pngs'

async function resolveChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean)
  const home = process.env.USERPROFILE
  if (home) {
    const cacheRoot = path.join(home, '.cache', 'puppeteer', 'chrome')
    try {
      const versions = await fs.readdir(cacheRoot)
      for (const v of versions) {
        candidates.push(path.join(cacheRoot, v, 'chrome-win64', 'chrome.exe'))
      }
    } catch {}
  }
  for (const p of candidates) {
    try {
      await fs.access(p)
      return p
    } catch {}
  }
  throw new Error('Chrome não encontrado')
}

const exec = await resolveChrome()
console.log('chrome:', exec)
await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: exec,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
const pdfUrl = 'file:///' + PDF.replace(/\\/g, '/').replace(/^\//, '')
console.log('opening:', pdfUrl)

// Abre o PDF embed via HTML wrapper pra controlar viewport
await page.setViewport({ width: 900, height: 1273, deviceScaleFactor: 2 })

// Usa pdf.js via CDN pra renderizar páginas em canvas e tirar screenshot
const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs" type="module"></script>
<style>body{margin:0;background:#fff;font-family:sans-serif}canvas{display:block}</style>
</head><body>
<div id="out"></div>
<script type="module">
  import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs'
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs'
  const buf = await fetch('${pdfUrl}').then(r => r.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  window.__pageCount = doc.numPages
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i)
    const vp = p.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    canvas.id = 'page-' + i
    document.getElementById('out').appendChild(canvas)
    await p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  }
  window.__done = true
</script>
</body></html>`

await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 })
await page.waitForFunction('window.__done === true', { timeout: 60000 })

const pageCount = await page.evaluate('window.__pageCount')
console.log('total pages:', pageCount)

for (let i = 1; i <= pageCount; i++) {
  const el = await page.$('#page-' + i)
  if (!el) continue
  const out = path.join(OUT_DIR, `page-${String(i).padStart(2, '0')}.png`)
  await el.screenshot({ path: out, omitBackground: false })
  console.log('saved', out)
}

await browser.close()
console.log('OK')
