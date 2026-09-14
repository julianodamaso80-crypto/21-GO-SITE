import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ligarResolvedorDoNext } from '../_shim/resolver.ts'

ligarResolvedorDoNext()

/*
 * Peugeot 408 Sedan Allure 2.0 Flex 2012 (placa NYD0C34, FIPE R$ 29.380) — medido no
 * /api/plans/ em 14/09/2026. Como carro normal o Power so tem rastreador; os quatro planos
 * so existem na tabela de veiculo de trabalho (app/taxi).
 *
 * O cliente respondeu "Carro de aplicativo: Nao" e mesmo assim recebeu BASICO 129,61,
 * Do Seu Jeito 141,60, VIP 159,50 e PREMIUM 219,60 — os precos da tabela de aplicativo.
 */
const NORMAL = [
  { name: 'Monitoramento', priceValue: 49.9 },
  { name: 'ROUBO E FURTO + Ass 24h + Monitoramento', priceValue: 159.5 },
]
const TRABALHO = [
  { name: 'BÁSICO', priceValue: 129.61 },
  { name: 'Do Seu Jeito', priceValue: 141.6 },
  { name: 'VIP', priceValue: 159.5 },
  { name: 'PREMIUM', priceValue: 219.6 },
]

process.env.POWERAPI_TOKEN = process.env.POWERAPI_TOKEN || 'teste'

let chamadas: boolean[] = []

beforeEach(() => {
  chamadas = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { quotationWorkVehicle: boolean }
    chamadas.push(body.quotationWorkVehicle)
    return {
      ok: true,
      json: async () => ({ plans: body.quotationWorkVehicle ? TRABALHO : NORMAL }),
    }
  }) as unknown as typeof fetch
})

test('cliente que NAO e de aplicativo nao ve a tabela de aplicativo', async () => {
  const { planosDoPowerAoVivo } = await import('../../src/lib/powercrm-planos.ts')
  const r = await planosDoPowerAoVivo(4173, 147, {})
  assert.deepEqual(chamadas, [false], 'so podia perguntar a tabela normal')
  assert.deepEqual(r.planos, [], 'so rastreador no Power = nao fazemos esse veiculo')
})

test('cliente que declarou aplicativo continua sendo cotado pela tabela de trabalho', async () => {
  const { planosDoPowerAoVivo } = await import('../../src/lib/powercrm-planos.ts')
  const r = await planosDoPowerAoVivo(4173, 147, { trabalho: true })
  assert.deepEqual(chamadas, [false, true])
  assert.equal(r.tabelaDeTrabalho, true)
  assert.deepEqual(
    (r.planos || []).map((p) => [p.id, p.monthly]),
    [['basico', 129.61], ['do-seu-jeito', 141.6], ['vip', 159.5], ['premium', 219.6]],
  )
})
