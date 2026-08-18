import { test } from 'node:test'
import assert from 'node:assert/strict'
import { painelDoHost, vendedorDoCaminho } from '../../src/lib/painel/rotas.ts'

const MAPA = { 'parceiroanderson.21go.com.br': 'andersonagripino' }
const RESERVADAS = new Set(['cotacao', 'faq', 'blog', 'api', 'painel'])

test('host de parceiro devolve o consultor', () => {
  assert.equal(painelDoHost('parceiroanderson.21go.com.br', MAPA), 'andersonagripino')
})

test('host com porta ainda resolve', () => {
  assert.equal(painelDoHost('parceiroanderson.21go.com.br:3000', MAPA), 'andersonagripino')
})

test('host normal do site nao e painel', () => {
  assert.equal(painelDoHost('21go.com.br', MAPA), null)
  assert.equal(painelDoHost('painel.21go.com.br', MAPA), null)
  assert.equal(painelDoHost('', MAPA), null)
})

test('segundo segmento comum vira vendedor e o resto e a home', () => {
  assert.deepEqual(vendedorDoCaminho(['andersonagripino', 'juliano'], RESERVADAS), {
    vendedor: 'juliano',
    resto: '/',
  })
})

test('vendedor com pagina depois preserva o caminho', () => {
  assert.deepEqual(vendedorDoCaminho(['andersonagripino', 'juliano', 'cotacao'], RESERVADAS), {
    vendedor: 'juliano',
    resto: '/cotacao',
  })
})

test('rota do site NAO e vendedor — senao a cotacao sai do ar', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino', 'cotacao'], RESERVADAS), null)
  assert.equal(vendedorDoCaminho(['andersonagripino', 'blog', 'post'], RESERVADAS), null)
})

test('so o slug do consultor nao e vendedor', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino'], RESERVADAS), null)
})

test('segmento fora do formato nao e vendedor', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino', 'ab'], RESERVADAS), null)
  assert.equal(vendedorDoCaminho(['andersonagripino', 'jo-ao'], RESERVADAS), null)
})
