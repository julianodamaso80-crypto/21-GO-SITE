import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagensDaSimulacao, mensagemNaoFazemos } from '../../src/lib/isa/entrega.regras.ts'
import { montarFatos } from '../../src/lib/isa/fatos.regras.ts'
import { validarNumeros } from '../../src/lib/isa/validador.regras.ts'

const fatos = montarFatos({
  marca: 'Jeep', modelo: 'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.', ano: 2022, fipe: 116540, combustivel: 'FLEX',
  leilao: false, carroApp: false, estado: null,
  planos: [
    { id: 'basico', nome: 'Básico', mensal: 437 },
    { id: 'suv', nome: 'VIP SUV', mensal: 507 },
    { id: 'especial', nome: 'Veículos Especiais', mensal: 606.75 },
  ],
  ativacaoReferencia: 557, ativacaoPorPlano: { basico: 557, suv: 557, especial: 656.75 }, desconto50: null,
})

const msgs = mensagensDaSimulacao({
  abertura: 'boa noite, Juliano 😃', nome: 'Juliano', fatos, pdfUrl: 'https://21go.site/api/pdfs/lead_x',
  leilaoOuAppAssumido: true,
})

test('duas mensagens: a simulacao organizada e o PDF', () => {
  assert.equal(msgs.length, 2)
  assert.match(msgs[0], /^boa noite, Juliano 😃/)
  assert.match(msgs[0], /segue a sua simulação, Juliano/)
  assert.match(msgs[1], /PDF com todos os benefícios/)
  assert.match(msgs[1], /https:\/\/21go\.site\/api\/pdfs\/lead_x/)
})

test('traz veiculo, ano, FIPE, ativacao e cada plano com a mensalidade', () => {
  assert.match(msgs[0], /🚗 Jeep COMPASS/)
  assert.match(msgs[0], /📅 2022/)
  assert.match(msgs[0], /FIPE: R\$ 116\.540,00/)
  assert.match(msgs[0], /Ativação: R\$ 557,00/)
  assert.match(msgs[0], /Básico: R\$ 437,00\/mês/)
  assert.match(msgs[0], /VIP SUV: R\$ 507,00\/mês/)
  // plano com ativacao diferente mostra a dele
  assert.match(msgs[0], /Veículos Especiais: R\$ 606,75\/mês · ativação R\$ 656,75/)
})

test('lista EXATAMENTE os planos que vieram (sem inventar plano)', () => {
  assert.doesNotMatch(msgs[0], /Premium|Do Seu Jeito/)
})

test('avisa quando assumiu que nao e leilao nem aplicativo', () => {
  assert.match(msgs[0], /considerei que não é de leilão nem de aplicativo/)
  const sem = mensagensDaSimulacao({ abertura: null, nome: null, fatos, pdfUrl: 'x', leilaoOuAppAssumido: false })
  assert.doesNotMatch(sem[0], /considerei/)
  assert.match(sem[0], /^segue a sua simulação 😃/)
})

test('todo numero da mensagem passa no validador (montada so com fatos)', () => {
  for (const m of msgs) assert.deepEqual(validarNumeros(m, fatos.numerosPermitidos), { ok: true, invalidos: [] })
})

test('nao fazemos: ano antes de 2006 explica o motivo; resto e generico', () => {
  assert.match(mensagemNaoFazemos('ano'), /anterior a 2006/)
  assert.match(mensagemNaoFazemos('model'), /não estamos aceitando esse veículo/)
})
