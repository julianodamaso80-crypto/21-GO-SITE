import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadEhDeParceiro, ORIGENS_DE_BOT_DE_PARCEIRO } from '../../src/lib/parceiro.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

test('lead criado pela Mariana na conversa nao gera conversao da casa', () => {
  assert.equal(leadEhDeParceiro({ dominio: null, origem: 'mariana_whatsapp' }), true)
})

test('a origem fixa bate com a identidade da Mariana', () => {
  assert.ok(ORIGENS_DE_BOT_DE_PARCEIRO.includes(MARIANA.leadOrigem))
})

test('lead criado pela Isa continua da casa', () => {
  assert.equal(leadEhDeParceiro({ dominio: null, origem: 'isa_whatsapp' }), false)
})
