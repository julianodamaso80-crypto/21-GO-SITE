import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codFipeParaPrecificar } from '../../src/lib/powercrm-planos.regras.ts'

/*
 * Placa QPP1H87 (Josiel, 16/09/2026): o /plates/ do Power cadastrou o carro com o codigo FIPE do
 * Gol 1.0 (005490-9, R$ 43.264), mas o carro e o Gol 1.6 MSI (005491-7, R$ 46.747). A API Brasil
 * corrigiu a FIPE mostrada, e o preco continuou sendo pedido ao Power pela versao 1.0: o cliente
 * viu a FIPE do 1.6 com a mensalidade do 1.0 (VIP 227,41 em vez de 241,45).
 */

test('preco e FIPE saem da MESMA versao: vale o codigo da FIPE que foi mostrada', () => {
  assert.equal(codFipeParaPrecificar('005490-9', '005491-7'), '005491-7')
})

test('sem correcao, segue o codigo do Power', () => {
  assert.equal(codFipeParaPrecificar('005490-9', '005490-9'), '005490-9')
  assert.equal(codFipeParaPrecificar('005490-9', ''), '005490-9')
  assert.equal(codFipeParaPrecificar('005490-9', null), '005490-9')
})

test('Power sem codigo: usa o da FIPE (API Brasil)', () => {
  assert.equal(codFipeParaPrecificar('', '005491-7'), '005491-7')
  assert.equal(codFipeParaPrecificar(undefined, undefined), '')
})
