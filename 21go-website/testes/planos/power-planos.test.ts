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
  const p125 = lerPlanosDoPower([{ name: 'VIP MOTOS', priceValue: 112.88 }], { cilindrada: 125 })
  assert.deepEqual(p125.map((p) => p.id), ['moto-400'])
  const p900 = lerPlanosDoPower([{ name: 'VIP MOTOS', priceValue: 237.2 }], { cilindrada: 900 })
  assert.deepEqual(p900.map((p) => p.id), ['moto-1000'])
})

test('rastreador continua fora do criterio de "fazemos"', () => {
  assert.equal(ePlanoDeProtecao('ROUBO E FURTO + Ass 24h + Monitoramento'), false)
  assert.equal(ePlanoDeProtecao('Monitoramento'), false)
  assert.equal(ePlanoDeProtecao('VIP ESPECIAIS'), true)
})

/*
 * Kawasaki Versys 650cc 2011 — print de cliente de 03/09/2026: o site ofereceu
 * "VIP Moto ate 400cc" por R$ 257,40 para uma moto de 650cc.
 *
 * Resposta REAL do POST /api/plans/ (cityId 3658) medida no mesmo dia: o Power
 * devolve as DUAS tabelas de moto, e a de 400 e nominalmente de Honda/Yamaha.
 */
const VERSYS_650 = [
  { name: 'VIP MOTOS (HONDA E YAMAHA ATÉ 400 CC)', priceValue: 257.4 },
  { name: 'VIP MOTOS (MOTOS ATÉ 1.000 CC)', priceValue: 282.9 },
  { name: 'ROUBO E FURTO + ass 24h + Monitoramento', priceValue: 274.5 },
  { name: 'Monitoramento 24h Moto', priceValue: 49.9 },
]

test('Versys 650cc: moto de 650 pega a tabela ate 1.000cc, com o preco dela', () => {
  const planos = lerPlanosDoPower(VERSYS_650, { marca: 'KAWASAKI', cilindrada: 650 })
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['moto-1000', 282.9]],
  )
})

test('Versys 650cc: sem cilindrada, a marca ja tira a moto da tabela Honda/Yamaha', () => {
  const planos = lerPlanosDoPower(VERSYS_650, { marca: 'KAWASAKI' })
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['moto-1000', 282.9]],
  )
})

test('CG 160 da Honda continua na tabela de ate 400cc', () => {
  const planos = lerPlanosDoPower(
    [
      { name: 'VIP MOTOS (HONDA E YAMAHA ATÉ 400 CC)', priceValue: 130.68 },
      { name: 'VIP MOTOS (MOTOS ATÉ 1.000 CC)', priceValue: 155.78 },
      { name: 'Monitoramento 24h Moto', priceValue: 49.9 },
    ],
    { marca: 'HONDA', cilindrada: 162 },
  )
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['moto-400', 130.68]],
  )
})

test('CB 500F: Honda acima de 400cc sai da tabela de 400', () => {
  const planos = lerPlanosDoPower(
    [
      { name: 'VIP MOTOS (HONDA E YAMAHA ATÉ 400 CC)', priceValue: 308.72 },
      { name: 'VIP MOTOS (MOTOS ATÉ 1.000 CC)', priceValue: 333.7 },
    ],
    { marca: 'HONDA', cilindrada: 471 },
  )
  assert.deepEqual(
    planos.map((p) => [p.id, p.monthly]),
    [['moto-1000', 333.7]],
  )
})

test('moto continua com um plano so — nunca as duas tabelas na tela', () => {
  const planos = lerPlanosDoPower(VERSYS_650, { marca: 'KAWASAKI', cilindrada: 650 })
  assert.equal(planos.length, 1)
})


/*
 * Respostas REAIS medidas em 19/09/2026 (cityId 3658). O Power manda a tabela do veiculo PRIMEIRO
 * e emenda outras depois; a tela do consultor mostra so a primeira (print do Creta do Jorge:
 * VIP SUV 484,80 e Basico 424,50). O site lia todas, e a Isa ("tem Especiais -> so Especiais")
 * acabava oferecendo justamente a tabela emendada.
 */
const R = (name: string, priceValue: number) => ({ name, priceValue })
const ids = (xs: { id: string; monthly: number }[]) => xs.map((p) => `${p.id} ${p.monthly}`)

test('Creta Limited 2022: so a tabela SUV que vem primeiro (a do print do Power)', () => {
  const planos = lerPlanosDoPower([
    R('VIP SUV', 484.8), R('BÁSICO', 424.5), R('ROUBO E FURTO + Ass 24h + Monitoramento', 484.8),
    R('BÁSICO', 406.02), R('Do Seu Jeito', 418), R('VIP', 466.27), R('VIP ESPECIAIS', 577.51),
  ])
  assert.deepEqual(ids(planos), ['basico 424.5', 'suv 484.8'])
})

test('Compass 2022: VIP SUV 507 e Basico 437, sem o Especiais emendado no fim', () => {
  const planos = lerPlanosDoPower([
    R('VIP SUV', 507), R('BÁSICO', 437), R('ROUBO E FURTO + Ass 24h + Monitoramento', 507),
    R('VIP ESPECIAIS', 606.75), R('Monitoramento', 49.9),
  ])
  assert.deepEqual(ids(planos), ['basico 437', 'suv 507'])
})

test('Corolla XEi 2017: os 4 planos de carro, sem o Especiais emendado', () => {
  const planos = lerPlanosDoPower([
    R('BÁSICO', 345.79), R('Do Seu Jeito', 357.8), R('VIP', 418.88), R('PREMIUM', 523.22),
    R('VIP ESPECIAIS', 489.9), R('Monitoramento', 49.9), R('ROUBO E FURTO + Ass 24h + Monitoramento', 418.85),
  ])
  assert.deepEqual(ids(planos), ['basico 345.79', 'do-seu-jeito 357.8', 'vip 418.88', 'premium 523.22'])
})

test('Sportage 2010: tabela SUV primeiro; o Basico repetido da tabela de carro nao entra', () => {
  const planos = lerPlanosDoPower([
    R('VIP SUV', 213), R('BÁSICO', 169.3), R('ROUBO E FURTO + Ass 24h + Monitoramento', 213),
    R('BÁSICO', 150.81), R('Do Seu Jeito', 162.8), R('VIP', 194.42), R('PREMIUM', 255.25),
  ])
  assert.deepEqual(ids(planos), ['basico 169.3', 'suv 213'])
})

test('Especiais so fica quando e a tabela do veiculo (vem primeiro)', () => {
  const planos = lerPlanosDoPower([R('VIP ESPECIAIS', 238.5), R('BÁSICO', 129.61), R('VIP', 159.49)])
  assert.deepEqual(ids(planos), ['especial 238.5'])
})
