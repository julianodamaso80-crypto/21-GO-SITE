import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tabelasDoBot } from '../../src/lib/isa/identidade.regras.ts'

const SQL = readFileSync(path.resolve(import.meta.dirname, '../../supabase/migrations/300_mariana_schema.sql'), 'utf8')
const tab = tabelasDoBot('mariana')
const tabelas = Object.values(tab)

test('cria as 5 tabelas do bot copiando o esquema vivo da Isa', () => {
  assert.match(SQL, /CREATE SCHEMA IF NOT EXISTS mariana;/)
  for (const t of tabelas) {
    const nome = t.split('.')[1]
    assert.match(SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${t.replace('.', '\\.')} \\(LIKE public\\.${nome} INCLUDING ALL\\);`), t)
  }
})

test('isa_eventos tem sequencia propria (nao divide o id com a Isa)', () => {
  assert.match(SQL, /CREATE SEQUENCE IF NOT EXISTS mariana\.isa_eventos_id_seq OWNED BY mariana\.isa_eventos\.id;/)
  assert.match(SQL, /ALTER TABLE mariana\.isa_eventos ALTER COLUMN id SET DEFAULT nextval\('mariana\.isa_eventos_id_seq'\);/)
})

test('RLS ligado e anon/authenticated sem acesso', () => {
  for (const t of tabelas) assert.match(SQL, new RegExp(`ALTER TABLE ${t.replace('.', '\\.')} ENABLE ROW LEVEL SECURITY;`), t)
  assert.match(SQL, /REVOKE ALL ON SCHEMA mariana FROM anon, authenticated;/)
  assert.match(SQL, /REVOKE ALL ON ALL TABLES IN SCHEMA mariana FROM anon, authenticated;/)
  assert.match(SQL, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA mariana FROM anon, authenticated;/)
})

test('so aditivo: nada que apaga ou altera o que ja existe', () => {
  const codigo = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(codigo, /\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i)
  assert.doesNotMatch(codigo, /ALTER TABLE public\./i)
})
