import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anoModeloParaPower, divergenciasDoVeiculo } from '../../src/lib/power-veiculo.regras.ts'

/*
 * Em 21/09/2026 a Ana (Duster 1.6 2015, placa LRM4334) nasceu no Power como "Boreal Evolution
 * Zero KM", sem placa. Em 20/09 a Yngrid (Classic 2010, KYN2860) virou "Montana 2027", sem placa.
 * O site nao conferia o que o Power gravou, e o /quotation/update responde 200 mesmo quando
 * ignora o campo. Sem placa a busca do consultor nao acha o lead, e outro consultor cadastrou a
 * placa da Ana em outro CRM.
 */

test('Ana: Boreal Zero KM sem placa diverge nos tres campos', () => {
  const d = divergenciasDoVeiculo(
    { plate: '', carModel: 'Boreal Evolution 1.3 Turbo 16V 5p Aut.', carModelYear: '32000 Flex' },
    { placa: 'LRM4334', modelo: 'DUSTER 1.6 Hi-Flex 16V Mec.', anoModelo: 2015 },
  )
  assert.deepEqual(d.map((x) => x.campo), ['placa', 'modelo', 'ano'])
})

test('cotacao certa nao diverge, mesmo com espaco duplo e caixa diferente no nome', () => {
  const d = divergenciasDoVeiculo(
    { plate: 'LRM4334', carModel: 'DUSTER 1.6  Hi-Flex 16V Mec.', carModelYear: '2015 Flex' },
    { placa: 'lrm-4334', modelo: 'duster 1.6 hi-flex 16v mec.', anoModelo: 2015 },
  )
  assert.deepEqual(d, [])
})

test('Zero KM nunca passa por ano certo', () => {
  const d = divergenciasDoVeiculo(
    { plate: 'KYN2860', carModel: 'Classic Life/LS 1.0 VHC FlexP. 4p', carModelYear: 'Zero KM Flex' },
    { placa: 'KYN2860', modelo: 'Classic Life/LS 1.0 VHC FlexP. 4p', anoModelo: 2010 },
  )
  assert.deepEqual(d.map((x) => x.campo), ['ano'])
})

test('campo que o site nao sabe nao e cobrado', () => {
  const d = divergenciasDoVeiculo(
    { plate: '', carModel: 'Qualquer', carModelYear: '2020 Flex' },
    { placa: '', modelo: '', anoModelo: null },
  )
  assert.deepEqual(d, [])
})

test('ano modelo: usa o do veiculo; sem ele, repete o de fabricacao; nunca inventa', () => {
  assert.equal(anoModeloParaPower({ anoModelo: 2015, anoFabricacao: 2014 }), 2015)
  assert.equal(anoModeloParaPower({ anoModelo: null, anoFabricacao: 2014 }), 2014)
  assert.equal(anoModeloParaPower({ anoModelo: undefined, anoFabricacao: undefined }), null)
  // "32000" e o codigo FIPE de zero-km: nao e ano
  assert.equal(anoModeloParaPower({ anoModelo: 32000, anoFabricacao: 2014 }), 2014)
})
