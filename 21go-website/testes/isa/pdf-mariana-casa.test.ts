import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atendimentoDoPdf, identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const ISA = identidadeDoAmbiente({})

test('no host da casa, PDF de lead da Mariana sai com o atendimento do Gabriel', () => {
  for (const lead of [{ origem: 'mariana_whatsapp' }, { dominio: '21go.app' }]) {
    const esperado = atendimentoDoPdf(lead, MARIANA)
    assert.ok(esperado)
    assert.deepEqual(atendimentoDoPdf(lead, ISA), esperado)
  }
})

test('lead da casa na identidade da Isa segue null', () => {
  assert.equal(atendimentoDoPdf({ origem: 'site_organico', dominio: '21go.site' }, ISA), null)
  assert.equal(atendimentoDoPdf({}, ISA), null)
})
