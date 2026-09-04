import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planosDaTelaParaPdf } from '../../src/lib/planos-do-pdf.regras.ts'

/*
 * O PDF tem que imprimir os planos que o cliente VIU — e o que ele viu veio do PowerCRM.
 *
 * Ate 04/09/2026 o PDF nao recebia essa lista: recalculava tudo de novo pela tabela local,
 * adivinhando a categoria pelo nome do modelo. Medido contra o Power ao vivo no mesmo dia,
 * a Saveiro CROSS 1.6 (FIPE 88.070) e o caso limpo — o Power cota como CARRO COMUM (4 planos,
 * VIP R$ 418,88) e a palavra "saveiro" esta em SUV_MODELS, entao o PDF imprimia um plano so,
 * "SUV / Caminhonete" R$ 437,30. Plano diferente, nome diferente e R$ 18,42 a mais que o
 * cliente escolheu na tela.
 */

const SAVEIRO_NO_POWER = [
  { id: 'basico', name: 'Básico', monthly: 345.79 },
  { id: 'do-seu-jeito', name: 'Do Seu Jeito', monthly: 357.8 },
  { id: 'vip', name: 'VIP', monthly: 418.88, popular: true },
  { id: 'premium', name: 'Premium', monthly: 523.22 },
]

test('imprime os planos do Power, nao a categoria adivinhada pelo nome', () => {
  const planos = planosDaTelaParaPdf(SAVEIRO_NO_POWER)
  assert.ok(planos, 'a lista do Power tem que ser aceita')
  assert.deepEqual(
    planos!.map((p) => p.id),
    ['basico', 'do-seu-jeito', 'vip', 'premium'],
  )
  assert.equal(planos!.find((p) => p.id === 'vip')?.monthly, 418.88)
  assert.ok(!planos!.some((p) => p.id === 'suv'), 'Saveiro nao vira SUV: o Power cotou carro')
})

test('o valor vem do Power sem arredondar nem recalcular', () => {
  // Voyage 2012 de leilao: o Power da VIP 185,47 e o site desce uma faixa (185,47 - 25,98).
  // Quem desce e a tela; o PDF so imprime o que recebeu.
  const planos = planosDaTelaParaPdf([{ id: 'vip', name: 'VIP', monthly: 159.49 }])
  assert.equal(planos!.length, 1)
  assert.equal(planos![0].monthly, 159.49)
})

test('sem lista do Power devolve null — quem chama mantem o caminho antigo', () => {
  assert.equal(planosDaTelaParaPdf(undefined), null)
  assert.equal(planosDaTelaParaPdf(null), null)
  assert.equal(planosDaTelaParaPdf([]), null)
})

test('plano com id desconhecido ou preco invalido nao entra no PDF', () => {
  const planos = planosDaTelaParaPdf([
    { id: 'vip', name: 'VIP', monthly: 418.88 },
    { id: 'rastreador', name: 'Monitoramento', monthly: 49.9 },
    { id: 'premium', name: 'Premium', monthly: 0 },
  ])
  assert.deepEqual(planos!.map((p) => p.id), ['vip'])
})

test('lista so com lixo devolve null em vez de PDF vazio', () => {
  assert.equal(planosDaTelaParaPdf([{ id: 'rastreador', name: 'Monitoramento', monthly: 49.9 }]), null)
})

test('rotulo de categoria sai do plano que o Power deu', () => {
  assert.equal(planosDaTelaParaPdf([{ id: 'suv', name: 'SUV', monthly: 437.3 }])![0].categoryLabel, 'SUV')
  assert.equal(planosDaTelaParaPdf([{ id: 'moto-400', name: 'VIP Moto', monthly: 137.9 }])![0].categoryLabel, 'Moto')
  assert.equal(planosDaTelaParaPdf([{ id: 'especial', name: 'Especiais', monthly: 238.5 }])![0].categoryLabel, 'Especial')
  assert.equal(planosDaTelaParaPdf([{ id: 'vip', name: 'VIP', monthly: 185.47 }])![0].categoryLabel, 'Carro')
})
