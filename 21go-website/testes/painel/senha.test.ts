import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashSenha, conferirSenha, gerarSenha } from '../../src/lib/painel/senha.ts'

test('senha certa confere', () => {
  const h = hashSenha('segredo123')
  assert.ok(conferirSenha('segredo123', h))
})

test('senha errada nao confere', () => {
  const h = hashSenha('segredo123')
  assert.equal(conferirSenha('segredo124', h), false)
})

test('mesma senha gera hashes diferentes — o salt e por senha', () => {
  assert.notEqual(hashSenha('segredo123'), hashSenha('segredo123'))
})

test('hash corrompido nao derruba, so devolve falso', () => {
  assert.equal(conferirSenha('x', 'lixo'), false)
  assert.equal(conferirSenha('x', 'scrypt$zz$zz'), false)
})

test('senha gerada nao tem caractere que se confunde em print', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(gerarSenha(), /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/)
  }
})
