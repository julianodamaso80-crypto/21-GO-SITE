import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumirGastos, pontosDaResposta, diaDoPonto, rotuloDaCategoria } from '../../src/lib/isa/gastos.regras.ts'

// Pontos reais da Graph API (WABA dos boletos, 14/09/2026): a Meta manda o dia em unix e o
// custo em dolar, um ponto por dia E categoria.
const RESPOSTA = {
  id: '1574030237571526',
  pricing_analytics: {
    data: [
      {
        data_points: [
          { start: 1789354800, end: 1789441200, pricing_category: 'AUTHENTICATION', volume: 28, cost: 0.1904 },
          { start: 1789354800, end: 1789441200, pricing_category: 'UTILITY', volume: 331, cost: 2.2508 },
          { start: 1789268400, end: 1789354800, pricing_category: 'AUTHENTICATION', volume: 1, cost: 0.0068 },
        ],
      },
    ],
  },
}

test('le os pontos da resposta da Meta, e nao quebra com objeto vazio', () => {
  assert.equal(pontosDaResposta(RESPOSTA).length, 3)
  // a Meta devolve so o id quando nao ha dado no periodo
  assert.deepEqual(pontosDaResposta({ id: '123' }), [])
  assert.deepEqual(pontosDaResposta(null), [])
})

test('soma por dia e por categoria, com o total em dolar', () => {
  const r = resumirGastos(pontosDaResposta(RESPOSTA))
  assert.equal(r.mensagens, 360)
  assert.equal(r.custo, 2.448) // 0.1904 + 2.2508 + 0.0068
  assert.equal(r.porDia.length, 2)
  // o dia mais novo fica por ultimo (ordem crescente, como o grafico le)
  const ultimo = r.porDia[r.porDia.length - 1]
  assert.equal(ultimo.mensagens, 359)
  assert.equal(ultimo.custo, 2.4412)
  // categoria mais cara primeiro
  assert.equal(r.porCategoria[0].categoria, 'Utilidade')
  assert.equal(r.porCategoria[0].custo, 2.2508)
  assert.equal(r.porCategoria[1].categoria, 'Autenticação')
})

test('mensagem sem custo (janela de atendimento) conta volume e zero de gasto', () => {
  const r = resumirGastos([{ start: 1789354800, volume: 48, cost: 0 }, { start: 1789354800, volume: 10 }])
  assert.equal(r.mensagens, 58)
  assert.equal(r.custo, 0)
})

test('o dia sai no fuso do Rio, nao em UTC', () => {
  // 1789354800 = 03:00 UTC, que e 00:00 de 14/09/2026 em Sao Paulo (conferido com `date`)
  assert.equal(diaDoPonto(1789354800), '2026-09-14')
  // 3 horas antes ainda e o dia anterior no Rio, mesmo ja sendo dia 14 em UTC
  assert.equal(diaDoPonto(1789354800 - 1), '2026-09-13')
})

test('categoria vira nome em portugues; desconhecida nao quebra', () => {
  assert.equal(rotuloDaCategoria('UTILITY'), 'Utilidade')
  assert.equal(rotuloDaCategoria('MARKETING'), 'Marketing')
  assert.equal(rotuloDaCategoria(undefined), 'Outros')
  assert.equal(rotuloDaCategoria('ALGO_NOVO'), 'Algo_novo')
})
