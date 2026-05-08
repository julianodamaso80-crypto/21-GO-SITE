import puppeteer from 'puppeteer-core'
import fs from 'node:fs/promises'
import path from 'node:path'

const URL_OR_FILE = process.argv[2]
const OUT_DIR = process.argv[3] || 'C:/tmp/preview-pngs'

async function resolveChrome() {
  const candidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe']
  const home = process.env.USERPROFILE
  if (home) {
    const cacheRoot = path.join(home, '.cache', 'puppeteer', 'chrome')
    try {
      const versions = await fs.readdir(cacheRoot)
      for (const v of versions) candidates.push(path.join(cacheRoot, v, 'chrome-win64', 'chrome.exe'))
    } catch {}
  }
  for (const p of candidates) {
    try { await fs.access(p); return p } catch {}
  }
  throw new Error('Chrome não encontrado')
}

const exec = await resolveChrome()
await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: exec,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()

// A4 em pixels: 794x1123 a 96dpi (210mm x 297mm)
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })

const target = URL_OR_FILE.startsWith('http')
  ? URL_OR_FILE
  : 'file:///' + URL_OR_FILE.replace(/\\/g, '/').replace(/^\//, '')

console.log('opening:', target)
await page.goto(target, { waitUntil: 'networkidle0', timeout: 60000 })

// Detecta cada .page do template e screenshot individual
const pageHandles = await page.$$('.page')
console.log('total pages:', pageHandles.length)

for (let i = 0; i < pageHandles.length; i++) {
  const out = path.join(OUT_DIR, `page-${String(i + 1).padStart(2, '0')}.png`)
  await pageHandles[i].screenshot({ path: out, type: 'png' })
  console.log('saved', out)
}

await browser.close()
console.log('OK')
