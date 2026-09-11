import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharMarca, filtrarVersoes, escolhaDoCliente, mensagemVersoes } from '../../src/lib/isa/versoes.regras.ts'

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

test('no maximo 6 opcoes', () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({ id: i, text: `ONIX VERSAO ${i}`, back: null }))
  assert.equal(filtrarVersoes(muitos, 'onix').length, 6)
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
