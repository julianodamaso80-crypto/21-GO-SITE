import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarEstilo } from '../../src/lib/isa/estilo.regras.ts'
import { identidadeDoAmbiente, IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const MAR = { maiuscula: true, semEmoji: true }

test('Mariana: frase com maiuscula e sem emoji', () => {
  assert.equal(
    aplicarEstilo('boa tarde, Pb, tudo bem? \u{1F603} como posso te ajudar?', MAR),
    'Boa tarde, Pb, tudo bem? Como posso te ajudar?',
  )
  assert.equal(
    aplicarEstilo('claro, sem pressa \u{1F64F}\u{1F3FC} sua simulação fica salva aqui', MAR),
    'Claro, sem pressa sua simulação fica salva aqui',
  )
  assert.equal(
    aplicarEstilo('me manda a placa do veículo, que eu consulto pra você \u{1F64F}\u{1F3FC}', MAR),
    'Me manda a placa do veículo, que eu consulto pra você',
  )
  assert.equal(aplicarEstilo('imagina! \u{1F64F}\u{1F3FC}', MAR), 'Imagina!')
  assert.equal(aplicarEstilo('fechado \u{1F44D}. até amanhã', MAR), 'Fechado. Até amanhã')
})

test('Mariana: cada linha e cada paragrafo comecam com maiuscula, acento incluso', () => {
  assert.equal(
    aplicarEstilo('é isso mesmo\nótimo, segue o plano\n\nqualquer dúvida me chama. é só falar! obrigada', MAR),
    'É isso mesmo\nÓtimo, segue o plano\n\nQualquer dúvida me chama. É só falar! Obrigada',
  )
})

test('Mariana: link, e-mail, valor, placa e 21Go ficam como estao', () => {
  const url = 'https://mariana.21go.site/api/pdfs/lead_x'
  assert.equal(aplicarEstilo(`segue o pdf:\n${url}`, MAR), `Segue o pdf:\n${url}`)
  assert.equal(aplicarEstilo(`o pdf. ${url}`, MAR), `O pdf. ${url}`)
  assert.equal(aplicarEstilo('o valor é R$ 1.234,56 por mês. a ativação é R$ 249,00', MAR), 'O valor é R$ 1.234,56 por mês. A ativação é R$ 249,00')
  assert.equal(aplicarEstilo('placa certa? abc1d23 é a sua', MAR), 'Placa certa? abc1d23 é a sua')
  assert.equal(aplicarEstilo('manda pra joao@exemplo.com. 21Go agradece', MAR), 'Manda pra joao@exemplo.com. 21Go agradece')
  assert.equal(aplicarEstilo('www.21go.site tem tudo', MAR), 'www.21go.site tem tudo')
})

test('Mariana: emoji de toda forma sai (bandeira, tecla, ZWJ, seletor) e o resto fica', () => {
  assert.equal(aplicarEstilo('oi \u{1F1E7}\u{1F1F7} tudo bem', MAR), 'Oi tudo bem')
  assert.equal(aplicarEstilo('opção 1\u{FE0F}\u{20E3} vip', MAR), 'Opção 1 vip')
  assert.equal(aplicarEstilo('família \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} toda', MAR), 'Família toda')
  assert.equal(aplicarEstilo('\u{2764}\u{FE0F} obrigada', MAR), 'Obrigada')
  assert.equal(aplicarEstilo('\u{1F973}', MAR), '')
  assert.equal(aplicarEstilo('custa R$ 89,90 (vip), 6% de cota; ok?', MAR), 'Custa R$ 89,90 (vip), 6% de cota; ok?')
})

test('so um dos dois ligado faz so a sua parte', () => {
  assert.equal(aplicarEstilo('oi \u{1F603} tudo bem', { maiuscula: false, semEmoji: true }), 'oi tudo bem')
  assert.equal(aplicarEstilo('oi \u{1F603} tudo bem', { maiuscula: true, semEmoji: false }), 'Oi \u{1F603} tudo bem')
})

test('Isa (padrao): o texto sai identico, emoji e minuscula', () => {
  const t = 'boa tarde, Pb \u{1F603}\n\nme manda a placa, que eu consulto pra você \u{1F64F}\u{1F3FC}  '
  assert.equal(aplicarEstilo(t, { maiuscula: false, semEmoji: false }), t)
  assert.equal(aplicarEstilo(t, IDENTIDADE_ISA.estilo), t)
  assert.equal(aplicarEstilo(t, undefined), t)
})

test('identidade: estilo vem do env, so na Mariana', () => {
  assert.equal(IDENTIDADE_ISA.estilo, undefined)
  assert.deepEqual(MARIANA.estilo, { maiuscula: true, semEmoji: true })
  assert.deepEqual(identidadeDoAmbiente({ BOT_MAIUSCULA: 'true' }).estilo, { maiuscula: true, semEmoji: false })
  assert.deepEqual(identidadeDoAmbiente({ BOT_SEM_EMOJI: '1' }).estilo, { maiuscula: false, semEmoji: true })
  assert.equal(identidadeDoAmbiente({ BOT_MAIUSCULA: '0', BOT_SEM_EMOJI: 'nao' }).estilo, undefined)
})
