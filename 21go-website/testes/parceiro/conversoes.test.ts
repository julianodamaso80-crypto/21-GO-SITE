import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARCEIROS, leadEhDeParceiro, trkDoLeadDoParceiro } from '../../src/lib/parceiro.regras.ts'

test('lead de parceiro por dominio ou por origem', () => {
  assert.equal(leadEhDeParceiro({ dominio: '21go.app', origem: 'site_organico' }), true)
  assert.equal(leadEhDeParceiro({ dominio: '21go.site', origem: 'parceiro_21goapp' }), true)
})

test('lead da casa e nulos nao sao de parceiro', () => {
  assert.equal(leadEhDeParceiro({ dominio: '21go.site', origem: 'site_organico' }), false)
  assert.equal(leadEhDeParceiro({ dominio: null, origem: null }), false)
  assert.equal(leadEhDeParceiro({}), false)
  assert.equal(leadEhDeParceiro(null), false)
})

const P = PARCEIROS['21goapp']
const MANHA = new Date('2026-10-01T12:00:00Z') // 09h em SP
const NOITE = new Date('2026-10-01T23:30:00Z') // 20h30 em SP, mesmo dia
const MADRUGADA_UTC = new Date('2026-10-02T01:00:00Z') // 22h do dia 01 em SP

test('trk: mesmo parceiro, telefone e placa no mesmo dia de SP = mesmo trk (16 hex)', () => {
  const a = trkDoLeadDoParceiro(P, '21999998888', 'abc-1d23', MANHA)
  assert.match(a, /^[0-9a-f]{16}$/)
  assert.equal(trkDoLeadDoParceiro(P, '21999998888', 'ABC1D23', NOITE), a)
  assert.equal(trkDoLeadDoParceiro(P, '(21) 99999-8888', 'ABC1D23', MADRUGADA_UTC), a)
})

test('trk: muda com telefone, placa ou dia', () => {
  const a = trkDoLeadDoParceiro(P, '21999998888', 'ABC1D23', MANHA)
  assert.notEqual(trkDoLeadDoParceiro(P, '21999997777', 'ABC1D23', MANHA), a)
  assert.notEqual(trkDoLeadDoParceiro(P, '21999998888', 'XYZ9K88', MANHA), a)
  assert.notEqual(trkDoLeadDoParceiro(P, '21999998888', null, MANHA), a)
  assert.notEqual(trkDoLeadDoParceiro(P, '21999998888', 'ABC1D23', new Date('2026-10-02T12:00:00Z')), a)
})
