import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ePlanoDeProtecao,
  mapearPlanoDoPower,
  lerPlanosDoPower,
} from '../../src/lib/powercrm-planos.regras.ts'

/*
 * Respostas REAIS do POST /api/plans/ medidas em 31/08/2026 (cityId 3658).
 * Cada uma corresponde a um print de cliente em que o site mostrou outra coisa.
 */

test('Tiida S 1.8 Aut 2009: o Power da VIP ESPECIAIS 238,50 — plano unico', () => {
  const planos = lerPlanosDoPower([
    { name: 'VIP ESPECIAIS', priceValue: 238.5 },
    { name: 'Monitoramento', priceValue: 49.9 },
    { name: 'ROUBO E FURTO + Ass 24h + Monitoramento', priceValue: 159.5 },
  ])
  assert.deepEqual(planos, [{ id: 'especial', nomePower: 'VIP ESPECIAIS', monthly: 238.5 }])
})

test('BMW X1 sDrive20i 2013: e carro comum de 4 planos, nao SUV', () => {
  const planos = lerPlanosDoPower([
    { name: 'BÁSICO', priceValue: 289.81 },
    { name: 'Do Seu Jeito', priceValue: 301.8 },
    { name: 'VIP', priceValue: 359.04 },
    { name: 'PREMIUM', priceValue: 470.32 },
    { name: 'Monitoramento', priceValue: 49.9 },
    { name: 'ROUBO E FURTO + Ass 24h + Monitoramento', priceValue: 359 },
  ])
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['basico', 289.81], ['do-seu-jeito', 301.8], ['vip', 359.04], ['premium', 470.32]],
  )
})

test('EcoSport 2006: o Power da BASICO E VIP SUV, na ordem de preco', () => {
  const planos = lerPlanosDoPower([
    { name: 'VIP SUV', priceValue: 168 },
    { name: 'BÁSICO', priceValue: 134.8 },
    { name: 'ROUBO E FURTO + Ass 24h + Monitoramento', priceValue: 168 },
    { name: 'Monitoramento', priceValue: 49.9 },
  ])
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['basico', 134.8], ['suv', 168]],
  )
})

test('Focus 1.6 S 2015: so rastreador — nao fazemos', () => {
  const planos = lerPlanosDoPower([
    { name: 'Monitoramento', priceValue: 49.9 },
    { name: 'ROUBO E FURTO + Ass 24h + Monitoramento', priceValue: 269.5 },
  ])
  assert.deepEqual(planos, [])
})

test('Focus Sedan 2.0 Aut 2015: fazemos, e o preco e o do print do cliente', () => {
  const planos = lerPlanosDoPower([
    { name: 'BÁSICO', priceValue: 202.49 },
    { name: 'Do Seu Jeito', priceValue: 214.5 },
    { name: 'VIP', priceValue: 269.53 },
    { name: 'PREMIUM', priceValue: 341.75 },
    { name: 'Monitoramento', priceValue: 49.9 },
  ])
  assert.equal(planos.length, 4)
  assert.equal(planos.find((p) => p.id === 'vip')?.monthly, 269.53)
})

test('nome que o Power nao usa nao vira plano inventado', () => {
  assert.equal(mapearPlanoDoPower('Seguro Auto Terceiros'), null)
  assert.deepEqual(lerPlanosDoPower([{ name: 'Seguro Auto Terceiros', priceValue: 100 }]), [])
})

test('preco zerado ou ausente nao entra — plano sem preco nao pode ir pra tela', () => {
  assert.deepEqual(lerPlanosDoPower([{ name: 'VIP', priceValue: 0 }]), [])
  assert.deepEqual(lerPlanosDoPower([{ name: 'VIP' }]), [])
})

test('moto: o Power tem uma tabela so, a cilindrada escolhe as coberturas', () => {
  const p125 = lerPlanosDoPower([{ name: 'VIP MOTOS', priceValue: 112.88 }], 125)
  assert.deepEqual(p125.map((p) => p.id), ['moto-400'])
  const p900 = lerPlanosDoPower([{ name: 'VIP MOTOS', priceValue: 237.2 }], 900)
  assert.deepEqual(p900.map((p) => p.id), ['moto-1000'])
})

test('rastreador continua fora do criterio de "fazemos"', () => {
  assert.equal(ePlanoDeProtecao('ROUBO E FURTO + Ass 24h + Monitoramento'), false)
  assert.equal(ePlanoDeProtecao('Monitoramento'), false)
  assert.equal(ePlanoDeProtecao('VIP ESPECIAIS'), true)
})
