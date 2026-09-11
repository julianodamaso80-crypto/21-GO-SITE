import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharMarca, filtrarVersoes, escolhaDoCliente, mensagemVersoes, mensagemDetalhe, MAX_OPCOES } from '../../src/lib/isa/versoes.regras.ts'

const marcas = [
  { id: 1, text: 'CHEVROLET' },
  { id: 2, text: 'VW - VOLKSWAGEN' },
  { id: 3, text: 'BYD' },
  { id: 4, text: 'CITROËN' },
]

test('acha a marca com e sem acento, pelo nome popular', () => {
  assert.equal(acharMarca(marcas, 'chevrolet')?.id, 1)
  assert.equal(acharMarca(marcas, 'Volkswagen')?.id, 2)
  assert.equal(acharMarca(marcas, 'vw')?.id, 2)
  assert.equal(acharMarca(marcas, 'citroen')?.id, 4)
  assert.equal(acharMarca(marcas, 'ferrari'), null)
})

const modelos = [
  { id: 10, text: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', back: '004469-4' },
  { id: 11, text: 'ONIX HATCH PREMIER 1.0 12V TB Flex Aut.', back: '004470-8' },
  { id: 12, text: 'ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.', back: '004478-3' },
  { id: 13, text: 'TRACKER LT 1.0 Turbo 12V Flex Aut.', back: '004489-9' },
  { id: 14, text: 'S10 Pick-Up LTZ 2.8 TDI 4x4 CD Diesel Aut', back: '004455-4' },
]

test('filtra as versoes pelo que o cliente disse — nunca escolhe por ele', () => {
  const v = filtrarVersoes(modelos, 'onix')
  assert.deepEqual(v.map((m) => m.id), [10, 11, 12])
  assert.deepEqual(filtrarVersoes(modelos, 'onix plus').map((m) => m.id)[0], 12)
  assert.deepEqual(filtrarVersoes(modelos, 'fusca'), [])
})

test('com mais de 6 versoes a Isa nao corta a lista: pede um detalhe', () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({ id: i, text: `ONIX VERSAO ${i}`, back: null }))
  assert.equal(filtrarVersoes(muitos, 'onix').length, 12)
  assert.ok(12 > MAX_OPCOES)
  assert.match(mensagemDetalhe('Onix', 2020), /tem várias versões do Onix 2020/)
})

test('entende a escolha: "2", "2️⃣", "o 3"; numero fora da lista nao vale', () => {
  assert.equal(escolhaDoCliente('2', 3), 1)
  assert.equal(escolhaDoCliente('2️⃣', 3), 1)
  assert.equal(escolhaDoCliente('é o 3', 3), 2)
  assert.equal(escolhaDoCliente('5', 3), null)
  assert.equal(escolhaDoCliente('quanto fica?', 3), null)
  // ano no meio da frase nao e escolha
  assert.equal(escolhaDoCliente('é 2020', 3), null)
})

test('mensagem com as versoes numeradas', () => {
  const m = mensagemVersoes('Onix', 2020, filtrarVersoes(modelos, 'onix'))
  assert.match(m, /achei essas versões do Onix 2020/)
  assert.match(m, /1️⃣ ONIX HATCH LT 1\.0/)
  assert.match(m, /3️⃣ ONIX SEDAN Plus LTZ/)
})

// Lista REAL do Power, Onix 2027 (11/09/2026)
const ONIX_2027 = [
  'ONIX HATCH 1.0 12V Flex 5p Mec.', 'ONIX HATCH 1.0 12V TB 5p Mec.', 'ONIX HATCH 1.0 12V TB Flex 5p Aut.',
  'ONIX HATCH ACTIV 1.0 12V TB Flex 5p Aut.', 'ONIX HATCH ECO 1.0 12V TB 5p Aut.', 'ONIX HATCH PREM. 1.0 12V TB Flex 5p Aut.',
  'ONIX HATCH PRO 1.0 12V 5p Mec.', 'ONIX HATCH RS 1.0 TB 12V Flex 5p Aut.', 'ONIX SED. Plus PREM. 1.0 12V TB Flex Aut',
  'ONIX SEDAN Plus 1.0 12V Mec.',
].map((text, id) => ({ id, text, back: null }))

test('nome completo igual ao do Power vai direto pra versao certa (teste do dono, 11/09)', () => {
  const v = filtrarVersoes(ONIX_2027, 'ONIX HATCH ACTIV 1.0 12V TB Flex 5p Aut.')
  assert.deepEqual(v.map((m) => m.text), ['ONIX HATCH ACTIV 1.0 12V TB Flex 5p Aut.'])
  // com a marca e o ano junto, do jeito que ele mandou
  assert.equal(filtrarVersoes(ONIX_2027, 'GM - Chevrolet ONIX HATCH ACTIV 1.0 12V TB Flex 5p Aut. 2027').length, 1)
})

test('entende manual/automatico/turbo/sedan/premier do jeito que o cliente fala', () => {
  const manual = filtrarVersoes(ONIX_2027, 'onix manual').map((m) => m.text)
  assert.ok(manual.length > 0 && manual.every((t) => /Mec\./.test(t)), manual.join(' | '))
  const turboManual = filtrarVersoes(ONIX_2027, 'onix 1.0 turbo manual').map((m) => m.text)
  assert.deepEqual(turboManual, ['ONIX HATCH 1.0 12V TB 5p Mec.'])
  const sedanPremier = filtrarVersoes(ONIX_2027, 'onix sedan premier').map((m) => m.text)
  assert.deepEqual(sedanPremier, ['ONIX SED. Plus PREM. 1.0 12V TB Flex Aut'])
})

test('so fica o que mais bate, nao tudo que tem uma palavra em comum', () => {
  const rs = filtrarVersoes(ONIX_2027, 'onix rs').map((m) => m.text)
  assert.deepEqual(rs, ['ONIX HATCH RS 1.0 TB 12V Flex 5p Aut.'])
})
