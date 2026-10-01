import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PARCEIROS,
  parceiroAutorizado,
  placaDoCorpo,
  fipeInformado,
  planoDeReferencia,
  consultaDaPlaca,
  leadDoParceiro,
} from '../../src/lib/parceiro.regras.ts'

/*
 * O lead que o 21go.app manda tem que nascer no nosso banco igual ao do site da casa (spec da
 * Mariana, secao 5), so que com o dominio e o Power do Gabriel.
 */

const COTADO = {
  success: true as const,
  vehicle: {
    marca: 'CHEVROLET',
    modelo: 'ONIX PLUS 1.0',
    ano: '2020',
    cor: 'PRATA',
    fipeValue: 68000,
    fipeCode: '004470-1',
    categoria: 'AUTOMOVEL',
    combustivel: 'FLEX',
  },
  plans: [
    { id: 'basico' as const, name: 'Básico', monthly: 150.5 },
    { id: 'vip' as const, name: 'VIP', monthly: 199.9, popular: true },
  ],
  fipe_source: 'apibrasil' as const,
  _internal: { mdl: 1, mdlYr: 2, cityId: 3, pcVehicle: { chassi: 'X' } },
}

const BASE = {
  parceiro: PARCEIROS['21goapp'],
  trk: 'a1b2c3d4e5f6a7b8',
  nome: 'Ana Paula',
  telefone: '21999998888',
  placa: 'ABC1D23',
  valorFipeInformado: 70000,
  quotationCode: 'Q123',
  negotiationCode: 'N456',
  powerResponsavel: 'XDmAbx6D',
  ip: '1.2.3.4',
  userAgent: 'node',
  referer: null,
}

test('21go.app: Power do Gabriel, dominio 21go.app e origem propria', () => {
  assert.deepEqual(
    { ...PARCEIROS['21goapp'] },
    {
      chave: '1f31905505bc033c80c4361c0dda6ae7',
      nome: 'Gabriel Juliano',
      powerlink: 'XDmAbx6D',
      dominio: '21go.app',
      origem: 'parceiro_21goapp',
    },
  )
})

test('so entra parceiro cadastrado, com a chave dele', () => {
  assert.equal(parceiroAutorizado('21goapp', '1f31905505bc033c80c4361c0dda6ae7'), PARCEIROS['21goapp'])
  assert.equal(parceiroAutorizado('21goapp', 'errada'), null)
  assert.equal(parceiroAutorizado('21goapp', undefined), null)
  assert.equal(parceiroAutorizado(undefined, undefined), null)
  // Chave herdada do Object nao e parceiro: antes, PARCEIROS['toString'] sem chave passava.
  for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.equal(parceiroAutorizado(k, undefined), null, k)
  }
})

test('placa e FIPE do corpo: so o que da pra usar', () => {
  assert.equal(placaDoCorpo('abc-1d23'), 'ABC1D23')
  for (const v of ['abc12', '', 12, null, undefined]) assert.equal(placaDoCorpo(v), null, String(v))
  assert.equal(fipeInformado(68000), 68000)
  for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '68000', null, undefined]) {
    assert.equal(fipeInformado(v), null, String(v))
  }
})

test('plano de referencia: o popular, senao o primeiro (como a tela abre)', () => {
  const a = { id: 'basico', name: 'Básico', monthly: 1, popular: false }
  const b = { id: 'vip', name: 'VIP', monthly: 2, popular: true }
  assert.equal(planoDeReferencia([a, b]), b)
  assert.equal(planoDeReferencia([a, { ...b, popular: false }]), a)
  assert.equal(planoDeReferencia([]), null)
})

test('consulta da placa: cotado so com plano, e sem os internos do Power', () => {
  assert.deepEqual(consultaDaPlaca(COTADO), {
    tipo: 'cotado',
    veiculo: { marca: 'CHEVROLET', modelo: 'ONIX PLUS 1.0', ano: '2020', fipeValue: 68000, fipeCode: '004470-1' },
    planos: [
      { id: 'basico', name: 'Básico', monthly: 150.5, popular: false },
      { id: 'vip', name: 'VIP', monthly: 199.9, popular: true },
    ],
  })
  assert.deepEqual(consultaDaPlaca({ ...COTADO, plans: [] }), { tipo: 'humano' })
  assert.deepEqual(consultaDaPlaca({ success: false, excluded: true, reason: 'ano', error: 'x' }), {
    tipo: 'nao_fazemos',
    motivo: 'ano',
  })
  assert.deepEqual(consultaDaPlaca({ success: false, excluded: true, error: 'x' }), { tipo: 'nao_fazemos', motivo: 'model' })
  assert.deepEqual(consultaDaPlaca({ success: false, requires_human_support: true, error: 'x' }), { tipo: 'humano' })
  assert.deepEqual(consultaDaPlaca(null), { tipo: 'humano' })
})

test('lead cotado: igual ao do site da casa, com o dominio e o Power do parceiro', () => {
  const l = leadDoParceiro({ ...BASE, consulta: consultaDaPlaca(COTADO) })
  assert.equal(l.trk, 'a1b2c3d4e5f6a7b8')
  assert.equal(l.nome, 'Ana Paula')
  assert.equal(l.telefone, '21999998888')
  assert.equal(l.placa, 'ABC1D23')
  assert.equal(l.dominio, '21go.app')
  assert.equal(l.origem, 'parceiro_21goapp')
  assert.equal(l.consultor_slug, null)
  assert.equal(l.vendedor_slug, null)
  assert.equal(l.marca, 'CHEVROLET')
  assert.equal(l.modelo, 'ONIX PLUS 1.0')
  assert.equal(l.ano_modelo, 2020)
  assert.equal(l.ano_fabricacao, 2020)
  assert.equal(l.fipe_codigo, '004470-1')
  // a FIPE da consulta vence a que o site do parceiro mandou
  assert.equal(l.valor_fipe, 68000)
  assert.equal(l.plano, 'VIP')
  assert.equal(l.valor_mensal, 199.9)
  assert.deepEqual(l.planos, [
    { id: 'basico', name: 'Básico', monthly: 150.5, popular: false },
    { id: 'vip', name: 'VIP', monthly: 199.9, popular: true },
  ])
  assert.equal(l.quotation_code, 'Q123')
  assert.equal(l.negotiation_code, 'N456')
  assert.equal(l.power_responsavel, 'XDmAbx6D')
  assert.equal(l.etapa_funil, 'cotacao_enviada')
  assert.equal(l.status, 'lead')
  assert.equal(l.leilao, null)
  assert.equal(l.carro_app, false)
  assert.equal(l.ip_address, '1.2.3.4')
  assert.equal(l.user_agent, 'node')
})

test('veiculo que nao fazemos: EXCLUIDO, sem planos (ninguem aborda)', () => {
  const l = leadDoParceiro({ ...BASE, consulta: { tipo: 'nao_fazemos', motivo: 'ano' } })
  assert.equal(l.plano, 'EXCLUIDO')
  assert.equal(l.planos, null)
  assert.equal(l.valor_mensal, null)
  assert.equal(l.etapa_funil, 'excluido')
  assert.equal(l.status, 'excluido')
  assert.equal(l.marca, null)
  assert.equal(l.valor_fipe, 70000)
  assert.equal(l.dominio, '21go.app')
  assert.equal(l.quotation_code, 'Q123')
})

test('consulta falhou ou sem placa: lead sem planos, como o atendimento humano do site', () => {
  const l = leadDoParceiro({ ...BASE, placa: null, valorFipeInformado: null, quotationCode: null, negotiationCode: null, consulta: { tipo: 'humano' } })
  assert.equal(l.plano, null)
  assert.equal(l.planos, null)
  assert.equal(l.valor_mensal, null)
  assert.equal(l.valor_fipe, null)
  assert.equal(l.placa, null)
  assert.equal(l.etapa_funil, 'cotacao_enviada')
  assert.equal(l.status, 'lead')
  assert.equal(l.quotation_code, null)
  assert.equal(l.dominio, '21go.app')
})
