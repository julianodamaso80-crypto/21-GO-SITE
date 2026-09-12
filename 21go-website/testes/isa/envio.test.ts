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
  // audios reais do teste de 11/09/2026 transcritos pelo Gemini 3.1 Pro
  assert.equal(ehInaudivel('[INAUDIVEL] falar [INAUDIVEL] aí [INAUDIVEL] garante [INAUDIVEL] aos benefícios que [INAUDIVEL]'), true)
  assert.equal(ehInaudivel('É bom dia. Queria uma ajuda com uma cotação veicular. Vocês [INAUDIVEL]'), false)
  assert.equal(ehInaudivel('Eu não falei nada de [INAUDIVEL]. Eu falei quais os benefícios que tem no plano de... como que funciona o plano.'), false)
  assert.match(AUDIO_INAUDIVEL, /não deu pra entender o áudio/)
  assert.match(mensagemAudioNaoEntendido(null), /não consegui entender seu áudio/)
  assert.match(mensagemAudioNaoEntendido(null), /repetir|mandar de novo/)
  assert.match(mensagemAudioNaoEntendido('boa tarde, Juliano 😃'), /^boa tarde, Juliano 😃\n\nnão consegui entender/)
})

test('a mesma frase nao sai duas vezes na mesma resposta (11/09/2026: "vou confirmar" 3x seguidas)', async () => {
  const { dividirEmPartes } = await import('../../src/lib/isa/envio.regras.ts')
  const t = 'essa eu vou confirmar e já te retorno 🙏🏼\n\nnão, a cota é a mesma pra todos os carros\n\nessa eu vou confirmar e já te retorno 🙏🏼\n\nessa eu vou confirmar e já te retorno'
  assert.deepEqual(dividirEmPartes(t), ['essa eu vou confirmar e já te retorno 🙏🏼', 'não, a cota é a mesma pra todos os carros'])
  // partes diferentes continuam inteiras
  assert.equal(dividirEmPartes('oi\n\ntudo bem?\n\nme manda a placa').length, 3)
})

test('duas perguntas juntas: cada parte cita a mensagem que responde (dono, 11/09/2026)', async () => {
  const { partesComCitacao } = await import('../../src/lib/isa/envio.regras.ts')
  const wamids = ['wamid.A', 'wamid.B']
  const r = partesComCitacao('[1] não tem problema\n\n[2] você ganha R$ 50,00 no pix', wamids)
  assert.deepEqual(r, [
    { texto: 'não tem problema', citar: 'wamid.A' },
    { texto: 'você ganha R$ 50,00 no pix', citar: 'wamid.B' },
  ])
  // duas partes da MESMA pergunta: as duas citam a mesma mensagem
  assert.deepEqual(partesComCitacao('[2] não tem problema\n\n[2] qualquer pessoa pode dirigir', wamids), [
    { texto: 'não tem problema', citar: 'wamid.B' },
    { texto: 'qualquer pessoa pode dirigir', citar: 'wamid.B' },
  ])
  // uma mensagem so: nao cita nada
  assert.deepEqual(partesComCitacao('[1] pode fazer normalmente', ['wamid.A']), [{ texto: 'pode fazer normalmente', citar: null }])
  // sem marcacao, ou marcacao que nao existe: nao cita
  assert.deepEqual(partesComCitacao('pode fazer normalmente', wamids), [{ texto: 'pode fazer normalmente', citar: null }])
  assert.deepEqual(partesComCitacao('[9] pode fazer', wamids), [{ texto: 'pode fazer', citar: null }])
})

test('[CORTADO]: so o marcador e "nao entendeu"; frase + marcador vai pra IA pedir o final (12/09/2026)', async () => {
  const { ehInaudivel } = await import('../../src/lib/isa/envio.regras.ts')
  assert.ok(ehInaudivel('[CORTADO]'))
  assert.ok(ehInaudivel('[INAUDIVEL] [CORTADO]'))
  assert.ok(!ehInaudivel('queria saber se vocês fazem carro de [CORTADO]'))
})
