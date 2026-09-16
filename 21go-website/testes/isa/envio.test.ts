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

test('a marcacao [1],[2] e interna e NUNCA chega no cliente (dono, 15/09/2026)', async () => {
  const { semMarcaDeParte } = await import('../../src/lib/isa/envio.regras.ts')
  // o caso do Pierre: saiu "[2] podemos sim! pra gente seguir com o plano basico..."
  assert.equal(semMarcaDeParte('[2] podemos sim! pra gente seguir'), 'podemos sim! pra gente seguir')
  assert.equal(semMarcaDeParte('[10] pode fazer normalmente'), 'pode fazer normalmente')
  assert.equal(semMarcaDeParte('  [1]   com espaco antes'), 'com espaco antes')
  // texto sem marcacao fica intacto
  assert.equal(semMarcaDeParte('bom dia, Pierre'), 'bom dia, Pierre')
  // colchete no MEIO da frase nao e marcacao: nao mexe
  assert.equal(semMarcaDeParte('o valor [2] vezes'), 'o valor [2] vezes')
  // nao confunde com numero solto
  assert.equal(semMarcaDeParte('2 saidas por mes'), '2 saidas por mes')
})

test('2 mensagens = responde as DUAS, citando cada uma (dono, 15/09/2026, caso da Lara)', async () => {
  const { marcasQueFaltam } = await import('../../src/lib/isa/envio.regras.ts')
  // o erro: ela respondeu so a regiao e deixou a pergunta de pagamento sem resposta
  assert.deepEqual(marcasQueFaltam('vale sim, atendemos o brasil todo', 2), [1, 2])
  assert.deepEqual(marcasQueFaltam('[1] vale sim, atendemos o brasil todo', 2), [2])
  // respondeu as duas: nada falta
  assert.deepEqual(marcasQueFaltam('[1] vale sim\n\n[2] boleto, pix ou cartão no app', 2), [])
  // uma mensagem so nao precisa de marca nenhuma
  assert.deepEqual(marcasQueFaltam('vale sim, atendemos o brasil todo', 1), [])
  // tres mensagens
  assert.deepEqual(marcasQueFaltam('[1] a\n\n[3] c', 3), [2])
  // marca no MEIO da linha nao conta (tem que abrir a parte)
  assert.deepEqual(marcasQueFaltam('o valor [2] vezes', 2), [1, 2])
})

test('falha passageira da Meta tenta de novo; erro de regra nao (Rafael, 15/09/2026)', async () => {
  const { ehFalhaPassageira } = await import('../../src/lib/isa/envio.regras.ts')
  // o erro exato que deixou o Rafael sem resposta
  assert.equal(ehFalhaPassageira('Cloud API 400 2: (#2) Service temporarily unavailable'), true)
  for (const m of ['fetch failed', 'ETIMEDOUT', 'socket hang up', 'Cloud API 503', '(#131000) Something went wrong', 'request timed out']) {
    assert.equal(ehFalhaPassageira(m), true, m)
  }
  // erro de regra: repetir nao adianta
  for (const m of ['(#131047) Re-engagement message', '(#100) Invalid parameter', '(#131026) Message undeliverable', 'destino fora da allowlist']) {
    assert.equal(ehFalhaPassageira(m), false, m)
  }
})

test('2 mensagens seguidas em turnos separados: a resposta CITA a mensagem (dono, 16/09/2026)', async () => {
  const { citarMensagemRespondida } = await import('../../src/lib/isa/envio.regras.ts')
  const agora = new Date('2026-09-16T16:07:00Z')
  const m = (id: string, dir: string, seg: number, content = 'x') =>
    ({ direction: dir, content, whatsapp_message_id: id, criada_em: new Date(agora.getTime() - seg * 1000).toISOString() })
  // o caso real: "moto seria 257,40" e "carro seria 269,53" com segundos de diferenca, as duas
  // chegando antes de a Isa responder
  const hist = [m('w_moto', 'inbound', 60), m('w_carro', 'inbound', 40)]
  const partes = [{ texto: 'isso mesmo, pro carro o vip e 269,53', citar: null }]
  assert.equal(citarMensagemRespondida(partes, hist, agora)[0].citar, 'w_carro')

  // Dono, 16/09/2026 (print da mensalidade no mes seguinte): UMA pergunta sem resposta se responde
  // normal, como gente — a de antes ja tinha sido respondida, entao nao cita
  const umaPorVez = [m('w_franquia', 'inbound', 60), m('isa1', 'outbound', 50), m('w_mensalidade', 'inbound', 40)]
  assert.equal(citarMensagemRespondida(partes, umaPorVez, agora)[0].citar, null)

  // mensagem unica, sem outra dele por perto: nao cita
  const so = [m('isa0', 'outbound', 400), m('w_um', 'inbound', 30)]
  assert.equal(citarMensagemRespondida(partes, so, agora)[0].citar, null)

  // a outra mensagem dele e antiga (fora da janela): nao conta
  const antiga = [m('w_velha', 'inbound', 3600), m('w_nova', 'inbound', 20)]
  assert.equal(citarMensagemRespondida(partes, antiga, agora)[0].citar, null)

  // ja citado pelo [n]: nao sobrescreve
  const jaCitada = [{ texto: 'a', citar: 'w_x' }]
  assert.equal(citarMensagemRespondida(jaCitada, hist, agora)[0].citar, 'w_x')

  // resposta em varias partes: cita so a primeira, como no WhatsApp
  const varias = citarMensagemRespondida([{ texto: 'a', citar: null }, { texto: 'b', citar: null }], hist, agora)
  assert.equal(varias[0].citar, 'w_carro')
  assert.equal(varias[1].citar, null)
})

test('trava geral: a Isa nunca manda mensagem demais sem o cliente responder (dono, 16/09/2026)', async () => {
  const { passaDoLimiteSemResposta, LIMITE_SEM_RESPOSTA } = await import('../../src/lib/isa/envio.regras.ts')
  assert.equal(LIMITE_SEM_RESPOSTA, 7)
  // resposta normal: simulacao inteira (peraí + resultado + observacao + pergunta) depois do template dos 5 min
  assert.equal(passaDoLimiteSemResposta(1, 4), false)
  // + a retomada dos 10 min
  assert.equal(passaDoLimiteSemResposta(5, 1), false)
  // o loop do Carlos: 3 da 1a cotacao + 3 da 2a, e a 3a ja nao sai
  assert.equal(passaDoLimiteSemResposta(6, 2), true)
  assert.equal(passaDoLimiteSemResposta(7, 1), true)
})
