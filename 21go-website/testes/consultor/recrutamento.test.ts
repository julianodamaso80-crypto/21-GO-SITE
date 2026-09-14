import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehCadastroDeConsultor,
  mensagemBoasVindas,
  mensagemAtendimentoVirtual,
  podeResponder,
  precisaBoasVindas,
  decidir,
  LINK_GRUPO,
} from '../../src/lib/consultor-recrutamento.regras.ts'

const TEXTO_DO_FORMULARIO =
  'Olá! Acabei de me cadastrar como consultor 21Go.\nNome: Ana Paula\nE-mail: ana@teste.com\nWhatsApp: (21) 99999-8888\nLocal: Rio de Janeiro - RJ'

test('reconhece o texto que o formulario do /seja-consultor monta', () => {
  assert.equal(ehCadastroDeConsultor(TEXTO_DO_FORMULARIO), true)
  // O cliente as vezes apaga o "Olá!" ou digita sem acento antes de enviar
  assert.equal(ehCadastroDeConsultor('acabei de me cadastrar como consultor 21go'), true)
  assert.equal(ehCadastroDeConsultor('Me cadastrei como Consultor'), true)
})

test('nao confunde com quem chega ao 4824 falando de outra coisa', () => {
  assert.equal(ehCadastroDeConsultor('oi, quero uma cotacao pro meu carro'), false)
  assert.equal(ehCadastroDeConsultor('bom dia'), false)
  assert.equal(ehCadastroDeConsultor(null), false)
  assert.equal(ehCadastroDeConsultor(''), false)
})

test('a saudacao acompanha a hora do Rio e comeca com maiuscula', () => {
  assert.match(mensagemBoasVindas('bom dia'), /^Bom dia! /)
  assert.match(mensagemBoasVindas('boa tarde'), /^Boa tarde! /)
  assert.match(mensagemBoasVindas('boa noite'), /^Boa noite! /)
})

test('as boas-vindas trazem treinamento, grupo e a indicacao da Leticya', () => {
  const m = mensagemBoasVindas('boa tarde')
  assert.match(m, /terças e quartas às 20h/)
  assert.ok(m.includes(LINK_GRUPO))
  assert.match(m, /Leticya Thayene/)
})

test('a resposta a quem pergunta diz que e virtual e devolve pro grupo', () => {
  const m = mensagemAtendimentoVirtual()
  assert.match(m, /atendimento virtual/i)
  assert.match(m, /grupo/)
  assert.ok(m.includes(LINK_GRUPO))
})

test('nasce fechada: sem env ninguem recebe, com allowlist so os numeros de teste', () => {
  assert.equal(podeResponder('5521999998888', {}), false)
  assert.equal(podeResponder('5521999998888', { allowlist: '5521992208062,5521965774240' }), false)
  assert.equal(podeResponder('5521992208062', { allowlist: '5521992208062,5521965774240' }), true)
  // O numero da allowlist pode vir formatado
  assert.equal(podeResponder('5521992208062', { allowlist: '+55 21 99220-8062' }), true)
  assert.equal(podeResponder('5521999998888', { ativo: 'on' }), true)
  assert.equal(podeResponder('', { ativo: 'on' }), false)
})

test('formulario reenviado dentro de 24 h nao ganha a mensagem de novo', () => {
  const agora = new Date('2026-09-14T15:00:00Z')
  assert.equal(precisaBoasVindas(null, agora), true)
  assert.equal(precisaBoasVindas(new Date('2026-09-14T14:00:00Z'), agora), false)
  assert.equal(precisaBoasVindas(new Date('2026-09-13T10:00:00Z'), agora), true)
})

test('o lead recebe as boas-vindas uma vez e o aviso de robo uma vez', () => {
  const agora = new Date('2026-09-14T15:00:00Z')
  const base = { boasVindasEm: null, avisoVirtualEm: null, agora }

  // 1. chegou pelo botao
  assert.equal(decidir({ ...base, texto: TEXTO_DO_FORMULARIO }), 'boas_vindas')

  // 2. perguntou alguma coisa depois
  const jaRecebeu = { ...base, boasVindasEm: new Date('2026-09-14T14:55:00Z') }
  assert.equal(decidir({ ...jaRecebeu, texto: 'quanto eu ganho por venda?' }), 'atendimento_virtual')

  // 3. insistiu — o robo cala
  const jaOuviu = { ...jaRecebeu, avisoVirtualEm: new Date('2026-09-14T14:57:00Z') }
  assert.equal(decidir({ ...jaOuviu, texto: 'mas e a comissao?' }), 'nada')
  assert.equal(decidir({ ...jaOuviu, texto: 'alguem ai?' }), 'nada')
})

test('quem nunca veio pelo botao nao e respondido: o 4824 e da casa', () => {
  const agora = new Date('2026-09-14T15:00:00Z')
  assert.equal(
    decidir({ texto: 'oi, quero cotar meu Onix', boasVindasEm: null, avisoVirtualEm: null, agora }),
    'nada',
  )
})
