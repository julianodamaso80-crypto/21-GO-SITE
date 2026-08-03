#!/usr/bin/env node --test
/**
 * Guarda-corpo da allowlist do PowerCRM. Roda com: node --test scripts/testar-allowlist.mjs
 *
 * O caso da Fiat Linea (03/08/2026) e o motivo deste arquivo existir: duas versoes do MESMO
 * grupo, uma com plano no Power e a outra sem. Regra por nome nao separa as duas; ID separa.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

const { planoNoPowerCrm, ALLOWLIST_TAMANHO } = await import('../src/data/vehicle-allowlist.ts')

test('Linea Essence Dualogic (1044) nao tem plano — foi o veiculo cotado por engano', () => {
  assert.equal(planoNoPowerCrm(1044), false)
})

test('Linea Essence 1.8 manual (1043) tem plano — nao pode ser bloqueado junto', () => {
  assert.equal(planoNoPowerCrm(1043), true)
})

test('sem id o site nao decide no escuro', () => {
  assert.equal(planoNoPowerCrm(null), null)
  assert.equal(planoNoPowerCrm(undefined), null)
  assert.equal(planoNoPowerCrm(''), null)
  assert.equal(planoNoPowerCrm(0), null)
  assert.equal(planoNoPowerCrm('abc'), null)
})

test('id em texto funciona — o front manda string', () => {
  assert.equal(planoNoPowerCrm('1043'), true)
  assert.equal(planoNoPowerCrm('1044'), false)
})

test('a lista tem tamanho de gente grande (extracao vazia quebraria a cotacao inteira)', () => {
  assert.ok(ALLOWLIST_TAMANHO > 4000, `allowlist com so ${ALLOWLIST_TAMANHO} versoes`)
})

/**
 * Nomes reais medidos no `POST /api/plans/` em 03/08/2026. "ROUBO E FURTO + Ass 24h +
 * Monitoramento" e a armadilha: contem "Monitoramento" no fim e comeca com "Roubo e Furto",
 * e nao vale como protecao pro site.
 */
test('so plano de protecao de verdade conta', async () => {
  const { ePlanoDeProtecao } = await import('../src/lib/powercrm-planos.regras.ts')
  for (const nome of ['BÁSICO', 'Do Seu Jeito', 'VIP', 'PREMIUM', 'VIP SUV', 'VIP ESPECIAIS', 'VIP MOTOS (MOTOS ATÉ 1.000 CC)']) {
    assert.equal(ePlanoDeProtecao(nome), true, nome)
  }
  for (const nome of ['Monitoramento', 'Monitoramento 24h Moto', 'Monitoramento VEÍCULOS PESADOS', 'ROUBO E FURTO + Ass 24h + Monitoramento', 'ROUBO E FURTO + ass 24h + Monitoramento', '']) {
    assert.equal(ePlanoDeProtecao(nome), false, nome)
  }
})
