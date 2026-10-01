import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA } from './_mariana.ts'

const OBRIGATORIAS = [
  'BOT_NOME',
  'BOT_NUMERO',
  'BOT_HUMANO_ID',
  'BOT_HUMANO_NOME',
  'BOT_HUMANO_NOME_COMPLETO',
  'BOT_HUMANO_TELEFONE',
  'BOT_HUMANO_APELIDO',
  'BOT_DONO_POR',
  'POWERCRM_DEFAULT_SLSMN_NW_ID',
  'WA_WABA_ID',
  'BOT_SCHEMA',
  'BOT_SITE_URL',
  'BOT_LEAD_ORIGEM',
  'BOT_TRK_PREFIXO',
  'BOT_LEADS_5MIN_ORIGENS',
  'BOT_LEADS_5MIN_DOMINIOS',
]

for (const chave of OBRIGATORIAS) {
  test(`bot fora da casa sem ${chave} recusa o valor herdado da Isa`, () => {
    const env: Record<string, string> = { ...ENV_MARIANA }
    delete env[chave]
    assert.throws(() => identidadeDoAmbiente(env), new RegExp(chave))
  })
}

test('o env completo da Mariana passa', () => {
  assert.doesNotThrow(() => identidadeDoAmbiente(ENV_MARIANA))
})

test('sem env nenhum (Isa) passa', () => {
  assert.doesNotThrow(() => identidadeDoAmbiente({}))
})
