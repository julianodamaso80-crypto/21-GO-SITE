import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA } from './_mariana.ts'

test('env da Mariana copiado da casa com o phone id da Isa nao sobe', () => {
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, WA_PHONE_ID: '1457563414097446' }), /phone id da Isa/)
})

test('o phone id da Mariana passa', () => {
  assert.equal(identidadeDoAmbiente(ENV_MARIANA).phoneId, '1308557115675774')
})

test('a casa sem env segue de pe, sem phone id', () => {
  assert.equal(identidadeDoAmbiente({}).phoneId, undefined)
})

test('a casa com o proprio phone id segue de pe', () => {
  assert.equal(identidadeDoAmbiente({ WA_PHONE_ID: '1457563414097446' }).phoneId, '1457563414097446')
})
