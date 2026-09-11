import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  payloadDesconto,
  interpretarDono,
  valorAutorizadoValido,
  mensagemDesconto50,
  mensagemDescontoDoDono,
  mensagemDonoRecusou,
  mensagemTransferencia,
  entradaPopup,
} from '../../src/lib/isa/dono.regras.ts'

test('o botao do alerta carrega o telefone do cliente e a decisao', () => {
  assert.equal(payloadDesconto('5521999998888', 'sim'), 'isa-desc:5521999998888:sim')
  assert.deepEqual(interpretarDono({ texto: 'Autorizar desconto', payload: 'isa-desc:5521999998888:sim' }), {
    acao: 'autorizar', telefone: '5521999998888',
  })
  assert.deepEqual(interpretarDono({ texto: 'Recusar', payload: 'isa-desc:5521999998888:nao' }), {
    acao: 'recusar', telefone: '5521999998888',
  })
})

test('o dono responde o valor em texto: "279", "R$ 279,90", "da 300"', () => {
  assert.deepEqual(interpretarDono({ texto: '279', payload: null }), { acao: 'valor', valor: 279 })
  assert.deepEqual(interpretarDono({ texto: 'R$ 279,90', payload: null }), { acao: 'valor', valor: 279.9 })
  assert.deepEqual(interpretarDono({ texto: 'da 300', payload: null }), { acao: 'valor', valor: 300 })
  assert.deepEqual(interpretarDono({ texto: 'nao', payload: null }), { acao: 'recusar' })
  assert.deepEqual(interpretarDono({ texto: 'ok obrigado', payload: null }), { acao: 'nada' })
})

test('valor autorizado so vale se for desconto de verdade', () => {
  assert.equal(valorAutorizadoValido(479, 557), true)
  assert.equal(valorAutorizadoValido(557, 557), false) // mesmo valor nao e desconto
  assert.equal(valorAutorizadoValido(600, 557), false) // mais caro nao
  assert.equal(valorAutorizadoValido(0, 557), false)
})

test('frase do desconto de entrada: sempre o antes e o depois', () => {
  const m = mensagemDesconto50({ de: 557, para: 507 })
  assert.match(m, /você acaba de ganhar um desconto na sua ativação 🎉/)
  assert.match(m, /em vez de pagar R\$ 557,00, você vai pagar R\$ 507,00/)
})

test('desconto do dono vem na moldura "consegui um desconto bem legal"', () => {
  assert.match(mensagemDescontoDoDono({ de: 557, para: 479 }), /consegui um desconto bem legal pra gente fechar hoje: de R\$ 557,00 por R\$ 479,00/)
  assert.match(mensagemDonoRecusou(557), /R\$ 557,00/)
})

test('transferencia pro 4824 com o resumo pronto no link (quem escreve e o cliente)', () => {
  const m = mensagemTransferencia({ motivo: 'documento', resumo: 'Nome: Juliano | Jeep Compass 2022' })
  assert.match(m, /vou te passar pra Leticya/)
  assert.match(m, /https:\/\/wa\.me\/5521969454824\?text=/)
  assert.match(decodeURIComponent(m.split('text=')[1]), /Nome: Juliano \| Jeep Compass 2022/)
  assert.match(mensagemTransferencia({ motivo: 'associado', resumo: 'x' }), /que cuida disso pra você/)
})

test('entrada pelo popup: "Quero meu desconto" + o lead do link do PDF', () => {
  const txt = 'Quero meu desconto! 🙂\nNome: Juliano\nMinha simulação: https://21go.site/api/pdfs/lead_b4a6d7cb5bc1ee3d'
  assert.deepEqual(entradaPopup(txt), { popup: true, leadId: 'lead_b4a6d7cb5bc1ee3d' })
  assert.deepEqual(entradaPopup('quero meu desconto'), { popup: true, leadId: null })
  assert.deepEqual(entradaPopup('quanto fica?'), { popup: false, leadId: null })
})
