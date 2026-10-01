import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadPrecisaDoPower, powerlinkDaOrigem, ORIGENS_DA_FILA_LISTA } from '../../src/lib/power-fila.regras.ts'
import { LEADS_DE_PARCEIRO } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

const AGORA = new Date('2026-10-01T15:00:00Z')
const base = { origem: 'mariana_whatsapp', status: 'lead', quotation_code: null, negotiation_code: null, created_at: '2026-10-01T14:00:00Z' }

test('lead da Mariana sem Power entra na fila', () => {
  assert.equal(leadPrecisaDoPower(base, AGORA), true)
  assert.ok(ORIGENS_DA_FILA_LISTA.includes('mariana_whatsapp'))
  // a fila de sempre nao mudou
  for (const o of ['site_organico', 'isa_whatsapp']) assert.ok(ORIGENS_DA_FILA_LISTA.includes(o), o)
})

test('lead da Mariana vai pro Power do Gabriel, nunca pro da Leticya', () => {
  assert.equal(powerlinkDaOrigem(MARIANA.leadOrigem), MARIANA.powerlink)
  assert.equal(powerlinkDaOrigem('mariana_whatsapp'), 'XDmAbx6D')
  // o resto segue a regra de hoje (consultor do site, senao a casa)
  for (const o of ['isa_whatsapp', 'site_organico', null, undefined, 'toString']) assert.equal(powerlinkDaOrigem(o), null, String(o))
  // a marca e a mesma que a Isa usa pra deixar esses leads de fora
  assert.deepEqual([...LEADS_DE_PARCEIRO.origens], ['mariana_whatsapp'])
})
