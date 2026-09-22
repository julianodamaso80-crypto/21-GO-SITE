import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadPrecisaDoPower, buscasDoLead } from '../../src/lib/power-fila.regras.ts'

const AGORA = new Date('2026-09-22T15:00:00Z')
const base = {
  origem: 'site_organico',
  status: 'lead',
  quotation_code: null,
  negotiation_code: null,
  created_at: '2026-09-22T14:00:00Z',
}

test('lead do site sem codigo do Power entra na fila', () => {
  assert.equal(leadPrecisaDoPower(base, AGORA), true)
  assert.equal(leadPrecisaDoPower({ ...base, origem: 'isa_whatsapp' }, AGORA), true)
})

test('EXCLUIDO nunca vai ao Power (ordem do dono, 31/07/2026)', () => {
  assert.equal(leadPrecisaDoPower({ ...base, status: 'excluido' }, AGORA), false)
})

test('quem ja tem codigo, ou nao passou pelo formulario/Isa, fica de fora', () => {
  assert.equal(leadPrecisaDoPower({ ...base, quotation_code: 'abc' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, negotiation_code: 'abc' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, origem: 'power_crm' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, origem: 'manual' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, origem: 'seja_consultor' }, AGORA), false)
})

test('espera 10 min (a criacao pode estar em andamento) e desiste depois de 30 dias', () => {
  assert.equal(leadPrecisaDoPower({ ...base, created_at: '2026-09-22T14:55:00Z' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, created_at: '2026-08-22T14:00:00Z' }, AGORA), false)
  assert.equal(leadPrecisaDoPower({ ...base, created_at: '2026-08-24T14:00:00Z' }, AGORA), true)
})

test('buscas: telefone nos dois formatos, e-mail e placa', () => {
  assert.deepEqual(
    buscasDoLead({ whatsapp: '5521964091921', email: 'a@b.com', placa_interesse: 'fry6i58' }),
    [
      { texto: '(21) 96409-1921', seletor: 26 },
      { texto: '21964091921', seletor: 26 },
      { texto: 'a@b.com', seletor: 25 },
      { texto: 'FRY6I58', seletor: 11 },
    ],
  )
  assert.deepEqual(buscasDoLead({ telefone: '21964091921', email: null, placa_interesse: null }), [
    { texto: '(21) 96409-1921', seletor: 26 },
    { texto: '21964091921', seletor: 26 },
  ])
})
