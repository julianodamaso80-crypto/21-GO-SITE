import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarResolvedorDoNext } from '../_shim/resolver.ts'

ligarResolvedorDoNext()

const base = { nome: 'Ana Souza', whatsapp: '5521999998888', marca: 'Fiat', modelo: 'Uno', ano: 2015, fipe: 30000, planoNome: 'VIP', mensalidade: 200 }

test('PDF da casa continua igual: botao do rodizio e rodape da 21Go', async () => {
  const { renderQuoteHTML } = await import('../../src/lib/pdf-quote.ts')
  const h = renderQuoteHTML(base)
  assert.match(h, /href="https:\/\/21go\.site\/api\/wa"/)
  assert.match(h, /<span class="footer-name">21Go Proteção Patrimonial Veicular<\/span>/)
})

test('PDF do lead da Mariana: botao e rodape do Gabriel, nada do rodizio da casa', async () => {
  const { renderQuoteHTML } = await import('../../src/lib/pdf-quote.ts')
  const h = renderQuoteHTML({ ...base, atendimento: { nome: 'Gabriel Juliano', whatsappUrl: 'https://wa.me/5521990954964' } })
  assert.match(h, /href="https:\/\/wa\.me\/5521990954964"/)
  assert.match(h, /<span class="footer-name">Gabriel Juliano<\/span>/)
  assert.doesNotMatch(h, /21go\.site\/api\/wa/)
})
