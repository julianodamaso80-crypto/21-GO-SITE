import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairNumeros, validarNumeros } from '../../src/lib/isa/validador.regras.ts'

const permitidos = { dinheiro: [437, 371.45, 415.15, 557, 507, 1550, 19.9, 50000], pct: [6, 15, 5, 100] }

test('extrai R$, porcentagem e valor com centavos mesmo sem R$', () => {
  const n = extrairNumeros('fica R$ 437,00 por mes, ativacao R$ 1.550 e 15% de desconto. sem o adesivo 415,15')
  assert.deepEqual(n.dinheiro.sort((a, b) => a - b), [415.15, 437, 1550])
  assert.deepEqual(n.pct, [15])
})

test('"R$ 50 mil" vira 50000; ano, km e horas nao sao dinheiro', () => {
  const n = extrairNumeros('terceiros de R$ 50 mil, guincho 400km, reboque em 72h, seu Onix 2020')
  assert.deepEqual(n.dinheiro, [50000])
  assert.deepEqual(n.pct, [])
})

test('resposta so com numeros calculados passa', () => {
  assert.deepEqual(validarNumeros('a cota e 6% e a mensalidade R$ 437,00 🙏🏼', permitidos), { ok: true, invalidos: [] })
})

test('numero inventado reprova, e diz qual', () => {
  const r = validarNumeros('o VIP fica R$ 289,90 e a cota e 10%', permitidos)
  assert.equal(r.ok, false)
  assert.deepEqual(r.invalidos.sort(), ['10%', 'R$ 289,90'])
})

test('o erro que quase aconteceu: cota de 6% numa moto (so 15% permitido)', () => {
  const moto = { dinheiro: [130], pct: [15, 5, 100] }
  assert.equal(validarNumeros('a cota da sua moto e 6%', moto).ok, false)
  assert.equal(validarNumeros('a cota da sua moto e 15%', moto).ok, true)
})

test('tolera formatacao: R$437 / R$ 437 / 437,00 sao o mesmo numero', () => {
  assert.equal(validarNumeros('R$437 ou R$ 437,00', permitidos).ok, true)
  assert.equal(validarNumeros('R$ 19,90 por mes', permitidos).ok, true)
})

test('telefone escrito pela IA nunca sai (11/09/2026: inventou "0800 2100 021")', () => {
  const p = { dinheiro: [116540, 437], pct: [6] }
  assert.equal(validarNumeros('o número do nosso 0800 é 0800 2100 021', p).ok, false)
  assert.equal(validarNumeros('me liga no (21) 98004-0964', p).ok, false)
  assert.equal(validarNumeros('chama no 21980040964', p).ok, false)
  // dinheiro, FIPE, ano, km e cota continuam passando
  assert.equal(validarNumeros('FIPE R$ 116.540,00 e a cota é 6%', p).ok, true)
  assert.equal(validarNumeros('CRLV de 2023 em diante, reboque de 1.000 km', p).ok, true)
  assert.equal(validarNumeros('o suporte é pelo 0800', p).ok, true)
  assert.equal(validarNumeros('seu PDF: https://21go.site/api/pdfs/lead_isa5521992208062kzo9e03', p).ok, true)
})
