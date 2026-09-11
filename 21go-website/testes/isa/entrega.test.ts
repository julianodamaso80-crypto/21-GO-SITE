import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagensDaSimulacao, mensagemNaoFazemos, recusaMotoDeLeilao } from '../../src/lib/isa/entrega.regras.ts'
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

test('moto de leilao a 21Go nao aceita (dono, 11/09/2026); carro de leilao aceita', () => {
  assert.equal(recusaMotoDeLeilao('MOTOCICLETA', true), true)
  assert.equal(recusaMotoDeLeilao('MOTOCICLETA', false), false)
  assert.equal(recusaMotoDeLeilao('AUTOMOVEL', true), false)
  assert.match(mensagemNaoFazemos('moto_leilao'), /não aceitamos moto de leilão/)
})

test('placa/modelo sem preco: a Isa pede pra conferir e oferece fazer pelo modelo — NUNCA manda pro 4824', async () => {
  const { mensagemPlacaNaoAchada, mensagemModeloSemPreco } = await import('../../src/lib/isa/entrega.regras.ts')
  for (const m of [mensagemPlacaNaoAchada(), mensagemModeloSemPreco()]) {
    assert.doesNotMatch(m, /wa\.me|4824|leticya/i)
  }
  assert.match(mensagemPlacaNaoAchada(), /confere/)
  assert.match(mensagemPlacaNaoAchada(), /modelo e o ano/)
  assert.match(mensagemModeloSemPreco(), /modelo e o ano|placa/)
})

test('escolheu o plano: reconhece o jeito que o cliente fala e pede os documentos', async () => {
  const { escolheuPlano, mensagemPedidoDocumentos } = await import('../../src/lib/isa/entrega.regras.ts')
  for (const t of ['Gostei do vip, como funciona guincho', 'quero o básico', 'vou fechar com o premium', 'vamos de do seu jeito', 'fico com o plano VIP SUV'])
    assert.equal(escolheuPlano(t), true, t)
  for (const t of ['qual a diferença do vip pro básico?', 'o vip tem carro reserva?', 'tem rastreador?', 'quero saber a cota'])
    assert.equal(escolheuPlano(t), false, t)
  assert.match(mensagemPedidoDocumentos(), /CNH/)
  assert.match(mensagemPedidoDocumentos(), /documento do veículo/)
  assert.match(mensagemPedidoDocumentos(), /comprovante de residência/)
})

test('placa que existe mas nao tem preco: a Isa diz como ela aparece no DENATRAN (caso RKW7J62, uma carreta)', async () => {
  const { mensagemPlacaNaoAchada } = await import('../../src/lib/isa/entrega.regras.ts')
  const m = mensagemPlacaNaoAchada('ND CARRETAS FZ 1E · 2021')
  assert.match(m, /essa placa aparece registrada como ND CARRETAS FZ 1E · 2021/)
  assert.match(m, /confere/)
  assert.doesNotMatch(m, /não consegui achar/)
  assert.doesNotMatch(m, /wa\.me|4824/)
  // sem nada do DENATRAN, continua o texto de conferir
  assert.match(mensagemPlacaNaoAchada(null), /não consegui achar essa placa/)
})

test('placa chegou: pergunta leilao e aplicativo JUNTOS antes dos valores (dono, 11/09/2026)', async () => {
  const { mensagemPerguntaLeilaoApp } = await import('../../src/lib/isa/entrega.regras.ts')
  const m = mensagemPerguntaLeilaoApp(null)
  assert.match(m, /antes de te passar os valores/)
  assert.match(m, /leilão\?/)
  assert.match(m, /aplicativo/)
  assert.match(mensagemPerguntaLeilaoApp('boa tarde, Juliano 😃'), /^boa tarde, Juliano 😃\n\n/)
})

test('le a resposta de leilao/aplicativo na ordem da pergunta', async () => {
  const { lerLeilaoApp } = await import('../../src/lib/isa/entrega.regras.ts')
  const nn = { leilao: false, app: false }
  for (const t of ['não', 'nao', 'Não e não', 'nao, nao', 'nenhum dos dois', 'nem um nem outro', 'não é leilão nem roda em app', 'não. uso particular']) {
    assert.deepEqual(lerLeilaoApp(t), nn, t)
  }
  assert.deepEqual(lerLeilaoApp('sim e não'), { leilao: true, app: false })
  assert.deepEqual(lerLeilaoApp('não e sim'), { leilao: false, app: true })
  assert.deepEqual(lerLeilaoApp('sim, os dois'), { leilao: true, app: true })
  assert.deepEqual(lerLeilaoApp('é de leilão'), { leilao: true, app: null })
  assert.deepEqual(lerLeilaoApp('não é de leilão'), { leilao: false, app: null })
  assert.deepEqual(lerLeilaoApp('rodo na uber'), { leilao: null, app: true })
  assert.deepEqual(lerLeilaoApp('leilão não, mas trabalho no 99'), { leilao: false, app: true })
  // "sim" sozinho nao diz qual dos dois; pergunta de outra coisa nao e resposta
  assert.deepEqual(lerLeilaoApp('sim'), { leilao: null, app: null })
  assert.deepEqual(lerLeilaoApp('quanto fica o vip?'), { leilao: null, app: null })
})
