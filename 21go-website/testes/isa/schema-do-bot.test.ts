import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * Nenhum SQL de tabela por-bot com `public.` fixo e nenhuma instancia 'cloud_isa' fixa: tudo vem
 * da identidade (TAB / IDENTIDADE.instancia). Senao a Mariana grava no banco da Isa.
 */

const SRC = path.resolve(import.meta.dirname, '../../src')
// Rotina so da casa (spec da Mariana, secao 4): nao roda no container dela.
const SO_DA_CASA = new Set([path.join('app', 'api', 'cron', 'vigia-byd', 'route.ts')])
// Onde mora o valor padrao da instancia.
const DEFINE_A_INSTANCIA = new Set([path.join('lib', 'isa', 'identidade.regras.ts')])

const arquivos = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f))

test('tabela por-bot so pelo schema da identidade (TAB), nunca public. fixo', () => {
  const fixo = /public\.(isa_contatos|isa_eventos|isa_config|isa_promocoes|consultor_recrutamento)\b|\b(from|into|update)\s+consultor_recrutamento\b/i
  const achados = arquivos().filter((f) => !SO_DA_CASA.has(f) && fixo.test(readFileSync(path.join(SRC, f), 'utf8')))
  assert.deepEqual(achados, [])
})

test("instancia so pela identidade: nenhum 'cloud_isa' fixo", () => {
  const achados = arquivos().filter(
    (f) => !DEFINE_A_INSTANCIA.has(f) && readFileSync(path.join(SRC, f), 'utf8').includes("'cloud_isa'"),
  )
  assert.deepEqual(achados, [])
})
