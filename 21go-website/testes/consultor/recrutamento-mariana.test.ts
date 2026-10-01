import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemBoasVindas, LINK_GRUPO } from '../../src/lib/consultor-recrutamento.regras.ts'
import { IDENTIDADE_ISA, indicacaoDoBot } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

test('sem indicacao, as boas-vindas sao as da Isa de hoje', () => {
  assert.equal(mensagemBoasVindas('boa tarde', 'Ana', indicacaoDoBot(IDENTIDADE_ISA)), mensagemBoasVindas('boa tarde', 'Ana'))
})

test('Mariana: mesmo treinamento e grupo, indicacao do Gabriel', () => {
  const m = mensagemBoasVindas('boa tarde', 'Ana', indicacaoDoBot(MARIANA))
  assert.match(m, /^Boa tarde, Ana! 👋/)
  assert.match(m, /terças e quartas às 20h/)
  assert.ok(m.includes(LINK_GRUPO))
  assert.match(m, /Ao entrar, informe que sua indicação é do consultor Gabriel Juliano\.$/)
  assert.doesNotMatch(m, /Leticya/)
})
