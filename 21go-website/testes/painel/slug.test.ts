import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarSlug, slugDeVendedor } from '../../src/lib/painel/slug.ts'

const RESERVADAS = new Set(['cotacao', 'faq', 'blog'])

test('normaliza tirando acento, espaco e maiuscula', () => {
  assert.equal(normalizarSlug('José da Silva'), 'josedasilva')
  assert.equal(normalizarSlug('Juliano'), 'juliano')
})

test('corta em 40 caracteres', () => {
  assert.equal(normalizarSlug('a'.repeat(60)).length, 40)
})

test('nome livre vira o proprio slug', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano')
})

test('nome repetido ganha os 4 ultimos digitos do celular', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(['juliano']),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano8062')
})

test('mesmo nome e mesmo final de celular ainda desempata', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(['juliano', 'juliano8062']),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano80622')
})

test('nunca devolve rota do site — senao a cotacao do consultor sai do ar', () => {
  const s = slugDeVendedor({
    nome: 'Cotação',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'cotacao8062')
})

test('nome curto demais nao vira slug', () => {
  const s = slugDeVendedor({
    nome: 'Jô',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, null)
})

test('slug com sufixo nunca passa de 40 caracteres', () => {
  const s = slugDeVendedor({
    nome: 'a'.repeat(60),
    whatsapp: '5521992208062',
    existentes: new Set(['a'.repeat(40)]),
    reservadas: RESERVADAS,
  })
  assert.equal(s!.length, 40)
  assert.ok(s!.endsWith('8062'))
})
