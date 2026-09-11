import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dividirEmPartes,
  pausaEntreSegundos,
  mediaIdValido,
  precisaPreambulo,
} from '../../src/lib/isa/envio.regras.ts'

test('divide a resposta nas linhas em branco, como a Leticya manda em rajada', () => {
  assert.deepEqual(dividirEmPartes('boa tarde 😃\n\nalguma duvida?'), ['boa tarde 😃', 'alguma duvida?'])
  assert.deepEqual(dividirEmPartes('  uma so  '), ['uma so'])
  assert.deepEqual(dividirEmPartes('a\n \n\n b\n\n\n'), ['a', 'b'])
  assert.deepEqual(dividirEmPartes(''), [])
})

test('quebra de linha simples nao divide (lista de planos fica numa mensagem)', () => {
  assert.deepEqual(dividirEmPartes('🚗 Onix\n📅 2020\n💰 FIPE'), ['🚗 Onix\n📅 2020\n💰 FIPE'])
})

test('nunca passa de 5 partes: o excesso vai junto na ultima', () => {
  const partes = dividirEmPartes(['1', '2', '3', '4', '5', '6', '7'].join('\n\n'))
  assert.equal(partes.length, 5)
  assert.equal(partes[4], '5\n\n6\n\n7')
})

test('pausa pela formula do Parlant, em segundos como no codigo deles', () => {
  // enviada curta (<=10 palavras): 0,5 · proxima curta: +1 · + 4 palavras/50
  assert.equal(pausaEntreSegundos('boa tarde', 'tudo bem com voce'), 0.5 + 1 + 4 / 50)
  // enviada longa (20 palavras): 20/50*2 = 0,8 · proxima curta: +1 · + 1/50
  const vinte = Array(20).fill('palavra').join(' ')
  assert.equal(pausaEntreSegundos(vinte, 'ok'), 0.8 + 1 + 1 / 50)
  // proxima longa (>10 palavras): +2
  assert.equal(pausaEntreSegundos('oi', vinte), 0.5 + 2 + 20 / 50)
})

test('pausa tem teto: cliente nao espera mais de 12 s entre duas partes', () => {
  const longa = Array(300).fill('palavra').join(' ')
  assert.ok(pausaEntreSegundos(longa, longa) <= 12)
})

test('media_id so aceita o formato da Meta (nada de caminho ou URL)', () => {
  assert.equal(mediaIdValido('1234567890123456'), true)
  assert.equal(mediaIdValido('abc.DEF_12-3'), true)
  assert.equal(mediaIdValido('../../etc/passwd'), false)
  assert.equal(mediaIdValido('https://evil'), false)
  assert.equal(mediaIdValido(''), false)
  assert.equal(mediaIdValido(null), false)
})

test('pre-mensagem ("perai"): nas 2 primeiras respostas, e depois so se as 2 ultimas esperas passaram de 5 s', () => {
  assert.equal(precisaPreambulo({ esperasAnteriores: [], ultimaFoiPreambulo: false }), true)
  assert.equal(precisaPreambulo({ esperasAnteriores: [3], ultimaFoiPreambulo: false }), true)
  assert.equal(precisaPreambulo({ esperasAnteriores: [3, 2, 1], ultimaFoiPreambulo: false }), false)
  assert.equal(precisaPreambulo({ esperasAnteriores: [3, 6, 7], ultimaFoiPreambulo: false }), true)
  assert.equal(precisaPreambulo({ esperasAnteriores: [], ultimaFoiPreambulo: true }), false)
})

test('audio que nao deu pra entender: a Isa pede pra repetir, nunca adivinha (teste do dono, 11/09/2026)', async () => {
  const { ehInaudivel, AUDIO_INAUDIVEL, mensagemAudioNaoEntendido } = await import('../../src/lib/isa/envio.regras.ts')
  assert.equal(ehInaudivel('[INAUDIVEL]'), true)
  assert.equal(ehInaudivel('inaudível'), true)
  assert.equal(ehInaudivel(''), true)
  assert.equal(ehInaudivel(null), true)
  assert.equal(ehInaudivel('Bom dia, queria uma cotação'), false)
  assert.match(AUDIO_INAUDIVEL, /não deu pra entender o áudio/)
  assert.match(mensagemAudioNaoEntendido(null), /não consegui entender seu áudio/)
  assert.match(mensagemAudioNaoEntendido(null), /repetir|mandar de novo/)
  assert.match(mensagemAudioNaoEntendido('boa tarde, Juliano 😃'), /^boa tarde, Juliano 😃\n\nnão consegui entender/)
})
