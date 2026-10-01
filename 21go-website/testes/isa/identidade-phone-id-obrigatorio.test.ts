import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA } from './_mariana.ts'

test('identidade fora da casa sem WA_PHONE_ID e recusada', () => {
  const { WA_PHONE_ID: _fora, ...semPhone } = ENV_MARIANA
  assert.throws(() => identidadeDoAmbiente(semPhone), /sem phone id/)
})

test('a casa sem WA_PHONE_ID continua valendo', () => {
  assert.doesNotThrow(() => identidadeDoAmbiente({}))
})
