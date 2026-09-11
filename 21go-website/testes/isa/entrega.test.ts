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
  abertura: 'boa noite, Juliano 😃', nome: 'JULIANO DAMASO', fatos, pdfUrl: 'https://21go.site/api/pdfs/lead_x',
  leilaoOuAppAssumido: true,
})

test('formato do dono: nome, veiculo, FIPE, todos os planos com preco, ativacao, PDF e a pergunta', () => {
  const m = msgs[0]
  assert.match(m, /^boa noite, Juliano 😃\n\nNome: JULIANO DAMASO\nVeículo: Jeep COMPASS LONG\. T270 1\.3 TB 4x2 Flex Aut\. 2022\nFIPE: R\$ 116\.540,00\n/)
  assert.match(m, /Plano Básico · R\$ 437,00\/mês/)
  assert.match(m, /Plano VIP SUV · R\$ 507,00\/mês/)
  // plano com ativacao diferente mostra a dele
  assert.match(m, /Plano Veículos Especiais · R\$ 606,75\/mês \(ativação R\$ 656,75\)/)
  assert.match(m, /Ativação: R\$ 557,00/)
  assert.match(m, /Sua simulação completa \(PDF\): https:\/\/21go\.site\/api\/pdfs\/lead_x/)
  assert.match(m, /qual deles se encaixa mais com o que você tá buscando\?$/)
})

test('lista EXATAMENTE os planos que vieram (sem inventar plano)', () => {
  assert.doesNotMatch(msgs[0], /Premium|Do Seu Jeito/)
})

test('avisa numa segunda mensagem quando assumiu que nao e leilao nem aplicativo', () => {
  assert.equal(msgs.length, 2)
  assert.match(msgs[1], /considerei que não é de leilão nem de aplicativo/)
  const sem = mensagensDaSimulacao({ abertura: null, nome: null, fatos, pdfUrl: 'x', leilaoOuAppAssumido: false })
  assert.equal(sem.length, 1)
  assert.match(sem[0], /^Veículo: /)
})

test('todo numero da mensagem passa no validador (montada so com fatos)', () => {
  for (const m of msgs) assert.deepEqual(validarNumeros(m, fatos.numerosPermitidos), { ok: true, invalidos: [] })
})

test('nao fazemos: ano antes de 2006 explica o motivo; resto e generico', () => {
  assert.match(mensagemNaoFazemos('ano'), /anterior a 2006/)
  assert.match(mensagemNaoFazemos('model'), /não estamos aceitando esse veículo/)
})
