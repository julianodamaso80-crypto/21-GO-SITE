import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAPAS,
  FUNIL_PADRAO,
  funilDoBot,
  ehEtapa,
  etapaCompativel,
  etapaDoCard,
  etiquetasAoMover,
} from '../../src/lib/isa/funil.regras.ts'
import { etiquetasDoBot } from '../../src/lib/isa/etiquetas.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const base = { etapa: null, escolheuPlano: false, mandouDocumento: false }

test('na Isa o funil e o de sempre', () => {
  assert.deepEqual(funilDoBot(IDENTIDADE_ISA), FUNIL_PADRAO)
  assert.equal(FUNIL_PADRAO.etapas, ETAPAS)
  assert.equal(FUNIL_PADRAO.humanoId, 'leticya')
})

test('Mariana: colunas = etiquetas dela, com Gabriel e sem Guilherme', () => {
  const f = funilDoBot(MARIANA)
  assert.deepEqual(
    f.etapas.map((e) => e.id),
    ['simulou', 'urgente', 'quente', 'gabriel', 'pensando', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'],
  )
  const tags = etiquetasDoBot(MARIANA)
  assert.deepEqual(f.etapas.map((e) => e.id).filter((id) => id !== 'simulou'), tags.map((t) => t.id))
  for (const e of f.etapas) {
    if (e.id === 'simulou') continue
    assert.equal(e.rotulo, tags.find((t) => t.id === e.id)?.nome, e.id)
  }
  assert.equal(ehEtapa('gabriel', f), true)
  assert.equal(ehEtapa('leticya', f), false)
  assert.equal(ehEtapa('guilherme', f), false)
})

test('Mariana: quem escolheu plano vai pro Gabriel, como na Isa vai pra Leticya', () => {
  const f = funilDoBot(MARIANA)
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true }, f), 'gabriel')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true, mandouDocumento: true }, f), 'documento')
  assert.equal(etapaCompativel('escolheu', f), 'gabriel')
  assert.equal(etapaCompativel('leticya', f), null)
  assert.equal(etapaCompativel('perdido', f), 'frio')
  assert.deepEqual(etiquetasAoMover(['gabriel'], 'fechou', f), ['gabriel', 'fechou'])
  assert.deepEqual(etiquetasAoMover(['gabriel', 'documento', 'fechou'], 'documento', f), ['gabriel', 'documento'])
  assert.equal(etapaDoCard({ ...base, etiquetas: ['gabriel', 'documento'] }, f), 'documento')
})
