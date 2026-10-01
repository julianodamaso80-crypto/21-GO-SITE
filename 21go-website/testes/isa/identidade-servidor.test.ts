import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarResolvedorDoNext } from '../_shim/resolver.ts'
import { ENV_MARIANA } from './_mariana.ts'

ligarResolvedorDoNext()
// Cada arquivo de teste roda em processo proprio: mexer no env aqui nao vaza pros outros.
Object.assign(process.env, ENV_MARIANA)

test('no container da Mariana o servidor le a identidade dela e o schema mariana', async () => {
  const { IDENTIDADE, TAB } = await import('../../src/lib/isa/identidade.ts')
  assert.equal(IDENTIDADE.nome, 'Mariana')
  assert.equal(IDENTIDADE.instancia, 'cloud_mariana')
  assert.equal(TAB.contatos, 'mariana.isa_contatos')
  assert.equal(TAB.eventos, 'mariana.isa_eventos')
  assert.equal(TAB.config, 'mariana.isa_config')
  assert.equal(TAB.promocoes, 'mariana.isa_promocoes')
  assert.equal(TAB.recrutamento, 'mariana.consultor_recrutamento')
})
