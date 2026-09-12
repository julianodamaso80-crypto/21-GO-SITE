import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehModeloExcluido, decidirElegibilidade } from '../../src/lib/elegibilidade.regras.ts'

/*
 * Fiat Idea: ordem do dono em 08/09/2026, depois de um Idea ELX 2009 (placa HJG6I52,
 * FIPE R$ 26.624) sair cotado com quatro planos e o cliente escolher o Premium.
 */

test('o Idea do print: cotado pelo Power, barrado aqui', () => {
  assert.equal(
    decidirElegibilidade({
      ano: 2009,
      powerAoVivo: true, // o Power DEU plano — e ainda assim nao fazemos
      allowlist: true,
      marca: 'Fiat',
      modelo: 'Idea ELX 1.4 mpi Fire Flex 8V 5p',
    }).acao,
    'nao_fazemos',
  )
})

test('a descricao inteira no modelo, sem marca separada, tambem barra', () => {
  assert.equal(ehModeloExcluido(null, 'Fiat Idea Adventure 1.8 16V Flex'), true)
})

test('grafia "Ideia" tambem barra', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Ideia ELX'), true)
})

test('so a palavra inteira: nada de casar por pedaco', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Idealle 1.0'), false)
  assert.equal(ehModeloExcluido('Chevrolet', 'Ideario Sport'), false)
})

test('outros Fiat continuam passando', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Palio ELX 1.4'), false)
  assert.equal(ehModeloExcluido('Fiat', 'Uno Mille Fire Flex'), false)
  assert.equal(ehModeloExcluido('Fiat', 'Punto Attractive 1.4'), false)
})

test('sem marca nem modelo nao barra ninguem', () => {
  assert.equal(ehModeloExcluido(null, null), false)
  assert.equal(ehModeloExcluido('', ''), false)
})

test('a exclusao vence o Power, igual ao corte de ano e ao BYD de leilao', () => {
  const v = decidirElegibilidade({
    ano: 2015,
    powerAoVivo: true,
    allowlist: true,
    marca: 'Fiat',
    modelo: 'Idea',
  })
  assert.deepEqual(v, { acao: 'nao_fazemos', motivo: 'modelo_excluido' })
})

/*
 * Chevrolet Meriva: ordem do dono em 10/09/2026, com um Meriva Maxx 1.4 2012 na mao —
 * "nenhum meriva faz".
 */

test('o Meriva do print: cotado pelo Power, barrado aqui', () => {
  assert.deepEqual(
    decidirElegibilidade({
      ano: 2012,
      powerAoVivo: true,
      allowlist: true,
      marca: 'GM - Chevrolet',
      modelo: 'Meriva Maxx 1.4 MPFI 8V ECONOFLEX 5p',
    }),
    { acao: 'nao_fazemos', motivo: 'modelo_excluido' },
  )
})

test('qualquer Meriva barra, com ou sem marca separada', () => {
  assert.equal(ehModeloExcluido('Chevrolet', 'MERIVA JOY 1.8 MPFI 8V FLEXPOWER'), true)
  // 12/09/2026: "nao fazemos esse carro" — o Prius que a Isa cotou pra Leticya
  assert.equal(ehModeloExcluido('Toyota', 'PRIUS 1.8 16V 5p Aut. (Híbrido)'), true)
  assert.equal(ehModeloExcluido('Toyota', 'COROLLA XEI 2.0'), false)
  assert.equal(ehModeloExcluido(null, 'GM - Chevrolet Meriva Premium 1.8 Easytronic'), true)
})

test('outros Chevrolet continuam passando', () => {
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Onix 1.0 Flex 8V 5p'), false)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Spin LTZ 1.8'), false)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Corsa Hatch Maxx 1.4'), false)
})

test('Power mudo com modelo excluido: barra antes de mandar pro consultor', () => {
  const v = decidirElegibilidade({
    ano: 2015,
    powerAoVivo: null,
    allowlist: null,
    marca: 'Fiat',
    modelo: 'Idea',
  })
  assert.equal(v.acao, 'nao_fazemos')
})

test('moto de leilao/remarcada: o site tambem nao faz (dono, 12/09/2026)', () => {
  const base = { ano: 2022, powerAoVivo: true, allowlist: true, marca: 'Honda', modelo: 'CG 160 TITAN' }
  assert.deepEqual(decidirElegibilidade({ ...base, moto: true, origem: 'leilao' }), { acao: 'nao_fazemos', motivo: 'moto_leilao' })
  assert.deepEqual(decidirElegibilidade({ ...base, moto: true, origem: 'remarcado' }), { acao: 'nao_fazemos', motivo: 'moto_leilao' })
  // moto normal e carro de leilao seguem normalmente
  assert.equal(decidirElegibilidade({ ...base, moto: true, origem: 'nao' }).acao, 'cotar')
  assert.equal(decidirElegibilidade({ ...base, moto: false, origem: 'leilao' }).acao, 'cotar')
})
