import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corpoDoVeiculo } from '../../src/lib/power-veiculo.regras.ts'

/*
 * "Preencher tudo em cotacao e salvar" (dono, 22/09/2026): placa, modelo, ano modelo e ano
 * fabricacao. E o mesmo corpo do botao Salvar do painel (#nwQttnSaveBttn ->
 * /company/updateQuotationVehicleData), medido no pipeline.js em 22/09/2026.
 */

test('com os dois anos, cada um no seu campo', () => {
  const c = corpoDoVeiculo({
    quotationId: 44852977,
    placa: 'tkr-8c73',
    chassi: '9BHCU51AASP659441',
    modeloId: 2538,
    anoModelo: 2024,
    anoFabricacao: 2023,
    cidadeId: 17,
    valorProtegido: 73402,
  })
  assert.equal(c.plates, 'TKR8C73')
  assert.equal(c.carModel, 2538)
  assert.equal(c.carModelYear, 2024)
  assert.equal(c.fabricationYear, 2023)
  assert.equal(c.city, 17)
  assert.equal(c.protectedValue, 73402)
  assert.equal(c.workVehicle, false)
})

test('so um ano: o mesmo vale para os dois', () => {
  const so_modelo = corpoDoVeiculo({ quotationId: 1, anoModelo: 2015 })
  assert.equal(so_modelo.carModelYear, 2015)
  assert.equal(so_modelo.fabricationYear, 2015)

  const so_fabricacao = corpoDoVeiculo({ quotationId: 1, anoFabricacao: 2015 })
  assert.equal(so_fabricacao.carModelYear, 2015)
  assert.equal(so_fabricacao.fabricationYear, 2015)
})

test('cliente sem placa: campo vazio, e nada mais deixa de ser preenchido', () => {
  const c = corpoDoVeiculo({ quotationId: 1, placa: null, modeloId: 7794, anoModelo: 2025 })
  assert.equal(c.plates, '')
  assert.equal(c.carModel, 7794)
  assert.equal(c.carModelYear, 2025)
})

test('o que o site nao sabe nao vai no corpo, pra nao apagar o que o Power tem', () => {
  const c = corpoDoVeiculo({ quotationId: 1 })
  assert.equal('carModel' in c, false)
  assert.equal('carModelYear' in c, false)
  assert.equal('fabricationYear' in c, false)
  assert.equal('city' in c, false)
  assert.equal('protectedValue' in c, false)
  assert.equal('chassi' in c, false)
})
