import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_REATIVACOES, CORTE_REATIVACAO, criadoDesde, candidatoAReativar, vezesReativada } from '../../src/lib/power-reativar.regras.ts'

test('regra do dono: no maximo 2 reativacoes, so clientes de setembro/2026 em diante', () => {
  assert.equal(MAX_REATIVACOES, 2)
  assert.equal(CORTE_REATIVACAO, '2026-09-01')
})

test('data do painel "dd/mm/aaaa - hh:mm" contra o corte', () => {
  assert.equal(criadoDesde('01/09/2026 - 00:10', '2026-09-01'), true)
  assert.equal(criadoDesde('22/09/2026 - 11:25', '2026-09-01'), true)
  assert.equal(criadoDesde('31/08/2026 - 23:59', '2026-09-01'), false)
  assert.equal(criadoDesde('', '2026-09-01'), false)
})

test('candidato: card da Leticya, expirado, colunas 1 e 2, de setembro em diante', () => {
  const base = { quotationExpire: true, pipelineColumn: 2, createdDate: '15/09/2026 - 10:00', salesmanName: 'Leticya Thayene Nascimento Lima', isShelved: false, isFleet: false }
  assert.equal(candidatoAReativar(base), true)
  assert.equal(candidatoAReativar({ ...base, quotationExpire: false }), false)
  assert.equal(candidatoAReativar({ ...base, pipelineColumn: 3 }), false) // vistoria: territorio do time interno
  assert.equal(candidatoAReativar({ ...base, createdDate: '20/08/2026 - 10:00' }), false)
  assert.equal(candidatoAReativar({ ...base, salesmanName: 'Karina Souza' }), false)
  assert.equal(candidatoAReativar({ ...base, isShelved: true }), false)
})

test('quantas vezes ja reativou, pelo historico do proprio card', () => {
  const hist = [
    { message: 'reativou essa Simulação por mais 7 dias' },
    { message: 'atualizou o campo Telefone celular de 1 para: 2' },
    { message: 'reativou essa Simulação por mais 7 dias' },
  ]
  assert.equal(vezesReativada(hist), 2)
  assert.equal(vezesReativada([]), 0)
  assert.equal(vezesReativada(null), 0)
})
