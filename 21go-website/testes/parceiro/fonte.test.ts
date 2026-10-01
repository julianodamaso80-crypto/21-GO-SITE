import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PARCEIROS } from '../../src/lib/parceiro.regras.ts'
import { IDENTIDADE_ISA, LEADS_DE_PARCEIRO, leadEhDoBot, atendimentoDoPdf } from '../../src/lib/isa/identidade.regras.ts'
import { leadPrecisaDoPower } from '../../src/lib/power-fila.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

/*
 * O que impede o lead do 21go.app de vazar pra casa: a Isa nao o ve, o PDF sai com o Gabriel em
 * qualquer host, a fila do Power da casa nao o recadastra no Power da Leticya e o vigia-BYD da casa
 * nao alerta por ele.
 */

const P = PARCEIROS['21goapp']
const lead = { origem: P.origem, dominio: P.dominio }

test('o lead do 21go.app e da Mariana e nunca da Isa', () => {
  assert.equal(leadEhDoBot(lead, MARIANA), true)
  assert.equal(leadEhDoBot(lead, IDENTIDADE_ISA), false)
  assert.ok(MARIANA.fonte5min.dominios.includes(P.dominio))
  assert.ok(!IDENTIDADE_ISA.fonte5min.dominios.includes(P.dominio))
  assert.ok(LEADS_DE_PARCEIRO.dominios.includes(P.dominio))
  assert.equal(P.powerlink, MARIANA.powerlink)
})

test('PDF do lead do 21go.app sai com o Gabriel, aberto pelo host da casa ou da Mariana', () => {
  const gabriel = { nome: 'Gabriel Juliano', whatsappUrl: 'https://wa.me/5521990954964' }
  assert.deepEqual(atendimentoDoPdf(lead, MARIANA), gabriel)
  assert.deepEqual(atendimentoDoPdf(lead, IDENTIDADE_ISA), gabriel)
})

test('lead do 21go.app sem codigo do Power nunca entra na fila da casa (Power da Leticya)', () => {
  const l = { origem: P.origem, status: 'lead', quotation_code: null, negotiation_code: null, created_at: '2026-10-01T14:00:00Z' }
  assert.equal(leadPrecisaDoPower(l, new Date('2026-10-01T15:00:00Z')), false)
})

test('vigia-BYD da casa deixa de fora o lead de site de parceiro', () => {
  const src = readFileSync(new URL('../../src/app/api/cron/vigia-byd/route.ts', import.meta.url), 'utf8')
  assert.match(src, /AND NOT \(l\.dominio = ANY\(\$2::text\[\]\)\)/)
  assert.match(src, /\[instancia, \[\.\.\.LEADS_DE_PARCEIRO\.dominios\]\]/)
})
