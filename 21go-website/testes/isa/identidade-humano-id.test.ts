import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA } from './_mariana.ts'

test('humano.id fora do formato (vira etiqueta no SQL) derruba a identidade', () => {
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_HUMANO_ID: "gab'riel" }), /humano\.id/)
})

test('humano.id valido e ambiente vazio seguem aceitos', () => {
  assert.doesNotThrow(() => identidadeDoAmbiente(ENV_MARIANA))
  assert.doesNotThrow(() => identidadeDoAmbiente({}))
})
