import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assinarSessao, lerSessao, type Sessao } from '../../src/lib/painel/sessao.ts'

const SEGREDO = 'segredo-de-teste'
const BASE: Sessao = {
  uid: 'pu_abc',
  slug: 'andersonagripino',
  papel: 'admin',
  v: 1,
  exp: 2_000_000_000_000,
}

test('ida e volta preserva a sessao', () => {
  const lida = lerSessao(assinarSessao(BASE, SEGREDO), SEGREDO, 1_000)
  assert.deepEqual(lida, BASE)
})

test('assinatura de outro segredo e recusada', () => {
  assert.equal(lerSessao(assinarSessao(BASE, 'outro'), SEGREDO, 1_000), null)
})

test('payload adulterado e recusado', () => {
  const token = assinarSessao(BASE, SEGREDO)
  const assinatura = token.split('.')[1]
  const falso = Buffer.from(JSON.stringify({ ...BASE, uid: 'pu_outro' })).toString('base64url')
  assert.equal(lerSessao(`${falso}.${assinatura}`, SEGREDO, 1_000), null)
})

test('sessao vencida e recusada', () => {
  const vencida = { ...BASE, exp: 1_000 }
  assert.equal(lerSessao(assinarSessao(vencida, SEGREDO), SEGREDO, 2_000), null)
})

test('lixo nao derruba', () => {
  assert.equal(lerSessao('', SEGREDO, 1), null)
  assert.equal(lerSessao('sem-ponto', SEGREDO, 1), null)
  assert.equal(lerSessao('a.b.c', SEGREDO, 1), null)
})
