import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETAPAS, ehEtapa, etapaDoCard } from '../../src/lib/isa/funil.regras.ts'

test('as colunas do funil na ordem do atendimento', () => {
  assert.deepEqual(ETAPAS.map((e) => e.id), ['novo', 'simulou', 'escolheu', 'documentos', 'vistoria', 'fechado', 'perdido'])
  for (const e of ETAPAS) assert.ok(e.rotulo && e.cor, e.id)
  assert.equal(ehEtapa('simulou'), true)
  assert.equal(ehEtapa('qualquer'), false)
})

test('sem escolha manual, a etapa vem do que ja aconteceu', () => {
  const base = { etapa: null, temSimulacao: false, escolheuPlano: false, mandouDocumento: false }
  assert.equal(etapaDoCard(base), 'novo')
  assert.equal(etapaDoCard({ ...base, temSimulacao: true }), 'simulou')
  assert.equal(etapaDoCard({ ...base, temSimulacao: true, escolheuPlano: true }), 'escolheu')
  assert.equal(etapaDoCard({ ...base, temSimulacao: true, escolheuPlano: true, mandouDocumento: true }), 'documentos')
})

test('o que a pessoa arrastou vence sempre (dono, 11/09/2026)', () => {
  assert.equal(etapaDoCard({ etapa: 'perdido', temSimulacao: true, escolheuPlano: true, mandouDocumento: true }), 'perdido')
  assert.equal(etapaDoCard({ etapa: 'vistoria', temSimulacao: false, escolheuPlano: false, mandouDocumento: false }), 'vistoria')
  // etapa invalida no banco nao quebra a tela: cai na automatica
  assert.equal(etapaDoCard({ etapa: 'lixo', temSimulacao: true, escolheuPlano: false, mandouDocumento: false }), 'simulou')
})
