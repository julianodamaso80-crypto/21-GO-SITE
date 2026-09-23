import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POWERLINK_LETICYA,
  criaPelaPipeline,
  telefoneDoPainel,
  cidadeDoDdd,
  anoDoModelo,
  etapaPadrao,
  lerCriacao,
  montarNovaNegociacao,
  decidirDuplicata,
} from '../../src/lib/power-pipeline.regras.ts'

test('so o powerlink da Leticya nasce pela pipeline', () => {
  assert.equal(criaPelaPipeline(POWERLINK_LETICYA), true)
  assert.equal(criaPelaPipeline('bqYwywAr'), false)
  assert.equal(criaPelaPipeline(''), false)
  assert.equal(criaPelaPipeline(null), false)
})

test('telefone sai com a mascara do painel, sem o 55', () => {
  assert.equal(telefoneDoPainel('21964091921'), '(21) 96409-1921')
  assert.equal(telefoneDoPainel('5521964091921'), '(21) 96409-1921')
  assert.equal(telefoneDoPainel('(21) 96409-1921'), '(21) 96409-1921')
  assert.equal(telefoneDoPainel('2133334444'), '(21) 3333-4444')
  // o painel recusa numero que nao fecha: melhor mandar vazio (e o e-mail segura)
  assert.equal(telefoneDoPainel('964091921'), '')
  assert.equal(telefoneDoPainel(null), '')
})

test('cidade de circulacao pelo DDD e a capital do estado (decisao do dono, 21/09/2026)', () => {
  assert.deepEqual(cidadeDoDdd('21964091921'), { uf: 'RJ', cidadeId: 3658, cidade: 'Rio de Janeiro' })
  assert.deepEqual(cidadeDoDdd('5524999990000'), { uf: 'RJ', cidadeId: 3658, cidade: 'Rio de Janeiro' })
  assert.deepEqual(cidadeDoDdd('11947650247'), { uf: 'SP', cidadeId: 5270, cidade: 'São Paulo' })
  assert.deepEqual(cidadeDoDdd('67996836658'), { uf: 'MS', cidadeId: 1506, cidade: 'Campo Grande' })
  assert.equal(cidadeDoDdd('20999990000'), null) // DDD que nao existe
  assert.equal(cidadeDoDdd(''), null)
})

test('ano do modelo: o do DENATRAN vence; sem ele, o que o cliente escolheu', () => {
  assert.equal(anoDoModelo('2019/2020', '2019'), 2020)
  assert.equal(anoDoModelo('', '2023'), 2023)
  assert.equal(anoDoModelo(null, 2023), 2023)
  assert.equal(anoDoModelo(undefined, 'Zero KM'), 32000) // no /bmy, "Zero KM" = 32000
  assert.equal(anoDoModelo(undefined, undefined), null)
})

test('etapa padrao do funil e a marcada isFunnelDefault, senao a primeira', () => {
  const funis = [
    {
      phases: [
        { stages: [{ id: 'a', order: 1, isFunnelDefault: false }, { id: 'b', order: 2, isFunnelDefault: true }] },
      ],
    },
  ]
  assert.deepEqual(etapaPadrao(funis), { stageId: 'b', stageIndex: 2 })
  assert.deepEqual(etapaPadrao([{ phases: [{ stages: [{ id: 'x', order: 1 }] }] }]), { stageId: 'x', stageIndex: 1 })
  assert.equal(etapaPadrao([]), null)
})

test('resposta do newQuotationAttempt: id > 0 e criou; senao diz o porque', () => {
  assert.deepEqual(lerCriacao({ id: 44830962, text: 'r9PelyKD', back: '7Ep0va4REM' }), {
    ok: true,
    quotationId: 44830962,
    quotationCode: 'r9PelyKD',
    negotiationCode: '7Ep0va4REM',
  })
  assert.deepEqual(lerCriacao({ id: 0, text: 'Versão incorreta. Por favor, atualize sua página para criar esta cotação.' }), {
    ok: false,
    motivo: 'Versão incorreta. Por favor, atualize sua página para criar esta cotação.',
  })
  // text null = placa/chassi ja atendida em outro card
  assert.deepEqual(lerCriacao({ id: 0, text: null, plates: 'FRY6I58', cardId: 'YDVvAvAyDa' }), {
    ok: false,
    motivo: 'placa/chassi FRY6I58 ja esta no card YDVvAvAyDa',
    duplicada: { placa: 'FRY6I58', cardId: 'YDVvAvAyDa' },
  })
  assert.deepEqual(lerCriacao(null), { ok: false, motivo: 'resposta vazia do Power' })
})

test('corpo da Nova Negociacao igual ao do painel', () => {
  const corpo = montarNovaNegociacao({
    nome: ' Fulano de Tal ',
    telefone: '5521964091921',
    email: 'f@x.com',
    placa: 'rvv7b04',
    tipoVeiculo: 1,
    modeloId: 917,
    anoModelo: 2023,
    cidadeId: 3658,
    origem: 1584,
    cooperativa: 3081,
    etapa: { stageId: 'b', stageIndex: 2 },
    chassi: '9BD000000000000A1',
  })
  assert.deepEqual(corpo, {
    name: 'Fulano de Tal',
    coop: '3081',
    phone: '(21) 96409-1921',
    email: 'f@x.com',
    city: '3658',
    sendToClient: false,
    workVehicle: false,
    vhclModel: '917',
    vhclYear: '2023',
    vhclIsCab: false,
    leadOrigem: '1584',
    leadOrigemSub: null,
    plates: 'RVV7B04',
    vhclType: '1',
    stageId: 'b',
    stageIndex: 2,
    chassi: '9BD000000000000A1',
  })
})

test('recusa por placa em outro card vem identificada, para decidir o que fazer', () => {
  const r = lerCriacao({ id: 0, text: null, plates: 'KOY6D00', cardId: 'Go1X1NPLEJ' })
  assert.equal(r.ok, false)
  assert.deepEqual(r.ok === false ? r.duplicada : null, { placa: 'KOY6D00', cardId: 'Go1X1NPLEJ' })
  // recusa de outro tipo nao vira duplicidade
  assert.equal(lerCriacao({ id: 0, text: 'Versão incorreta.' }).ok === false && lerCriacao({ id: 0, text: 'x' }).duplicada, undefined)
})

test('placa presa: card DELA reaproveita; card de outro consultor nasce pelo PowerLink (dono, 23/09/2026)', () => {
  // a busca do funil so enxerga os cards dela: achou = e dela
  assert.equal(decidirDuplicata('B2N3XweeEq'), 'usar_o_que_existe')
  assert.equal(decidirDuplicata(null), 'powerlink')
})
