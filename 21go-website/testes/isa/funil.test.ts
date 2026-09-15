import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETAPAS, ehEtapa, etapaDoCard, etapaCompativel } from '../../src/lib/isa/funil.regras.ts'
import { ETIQUETAS } from '../../src/lib/isa/etiquetas.regras.ts'

test('o funil comeca no Simulou e termina no Frio (dono, 15/09/2026)', () => {
  assert.deepEqual(
    ETAPAS.map((e) => e.id),
    ['simulou', 'leticya', 'documento', 'fechou', 'frio'],
  )
  // a coluna "Novo" saiu: quem nao simulou tambem entra no Simulou
  assert.equal(ehEtapa('novo'), false)
  assert.equal(ehEtapa('simulou'), true)
  assert.equal(ehEtapa('qualquer'), false)
  for (const e of ETAPAS) assert.ok(e.rotulo && e.cor, e.id)
})

test('as colunas depois do Simulou sao exatamente as etiquetas, com o mesmo id', () => {
  assert.deepEqual(
    ETAPAS.map((e) => e.id).filter((id) => id !== 'simulou'),
    ETIQUETAS.map((e) => e.id),
  )
  for (const e of ETAPAS) {
    if (e.id === 'simulou') continue
    const tag = ETIQUETAS.find((t) => t.id === e.id)
    assert.equal(e.rotulo, tag?.nome, e.id)
  }
})

test('sem escolha manual, a etapa vem do que ja aconteceu', () => {
  const base = { etapa: null, escolheuPlano: false, mandouDocumento: false }
  assert.equal(etapaDoCard(base), 'simulou')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true }), 'leticya')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true, mandouDocumento: true }), 'documento')
})

test('o que a pessoa arrastou vence sempre (dono, 11/09/2026)', () => {
  assert.equal(etapaDoCard({ etapa: 'frio', escolheuPlano: true, mandouDocumento: true }), 'frio')
  assert.equal(etapaDoCard({ etapa: 'fechou', escolheuPlano: false, mandouDocumento: false }), 'fechou')
  // etapa invalida no banco nao quebra a tela: cai na automatica
  assert.equal(etapaDoCard({ etapa: 'lixo', escolheuPlano: false, mandouDocumento: false }), 'simulou')
})

test('card que ficou na coluna antiga nao se perde ao trocar o funil', () => {
  assert.equal(etapaCompativel('novo'), 'simulou')
  assert.equal(etapaCompativel('escolheu'), 'leticya')
  assert.equal(etapaCompativel('documentos'), 'documento')
  // "vistoria" era depois do documento e nao tem mais coluna: fica no documento
  assert.equal(etapaCompativel('vistoria'), 'documento')
  assert.equal(etapaCompativel('fechado'), 'fechou')
  assert.equal(etapaCompativel('perdido'), 'frio')
  assert.equal(etapaCompativel('lixo'), null)
  assert.equal(etapaCompativel(null), null)
  // quem foi arrastado pra uma coluna antiga aparece na nova, sem precisar arrastar de novo
  assert.equal(etapaDoCard({ etapa: 'perdido', escolheuPlano: true, mandouDocumento: true }), 'frio')
})
