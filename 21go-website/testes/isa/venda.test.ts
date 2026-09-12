import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehFraseDeRobo,
  tirarFrasesDeRobo,
  perguntaDeBeneficios,
  planoParaListar,
  mensagemBeneficios,
  mensagemQualPlano,
  valorQuePagaHoje,
  comparacaoComHoje,
  ehDespedida,
  mensagemRetomada,
  jaPerguntouProtecao,
  PERGUNTA_TEM_PROTECAO,
} from '../../src/lib/isa/venda.regras.ts'
import { montarFatos } from '../../src/lib/isa/fatos.regras.ts'

const beneficios = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Item ${i + 1}`, included: true }))

const fatos = montarFatos({
  marca: 'Ford', modelo: 'Ka 1.5', ano: 2019, fipe: 52754, combustivel: null, leilao: false, carroApp: false, estado: null,
  planos: [
    { id: 'basico', nome: 'Básico', mensal: 172.7, beneficios: [...beneficios(14), { text: 'Carro Amigo', included: false }] },
    { id: 'vip', nome: 'VIP', mensal: 227.41, beneficios: beneficios(18) },
  ],
  ativacaoReferencia: 277.41, ativacaoPorPlano: { basico: 277.41, vip: 277.41 }, desconto50: null,
})
const compass = montarFatos({
  marca: 'Jeep', modelo: 'Compass', ano: 2022, fipe: 116540, combustivel: null, leilao: false, carroApp: false, estado: null,
  planos: [{ id: 'especial', nome: 'Veículos Especiais', mensal: 606.75, beneficios: beneficios(17) }],
  ativacaoReferencia: 656.75, ativacaoPorPlano: { especial: 656.75 }, desconto50: null,
})

test('frases de robo saem; o resto da resposta fica (auditoria 12/09/2026)', () => {
  for (const f of ['entendi', 'entendi, Leticya', 'Que legal!', 'ótima escolha 👍', 'posso te ajudar com mais alguma dúvida?', 'fico à disposição 🙏🏼', 'Perfeito.']) {
    assert.ok(ehFraseDeRobo(f), f)
  }
  for (const f of ['não tem problema', 'entendi que você quer o vip, então sigo com ele', 'legal, e quanto você paga hoje?', 'claro, sem pressa 🙏🏼 sua simulação fica salva aqui']) {
    assert.ok(!ehFraseDeRobo(f), f)
  }
  assert.equal(tirarFrasesDeRobo('entendi\n\ne quanto você paga hoje?'), 'e quanto você paga hoje?')
  assert.equal(tirarFrasesDeRobo('a cota é 6%\n\nposso te ajudar com mais alguma dúvida?'), 'a cota é 6%')
})

test('pergunta de beneficios: curta e sozinha entra no codigo; junto com outra coisa vai pra IA', () => {
  assert.deepEqual(perguntaDeBeneficios('quais beneficos dele?', 1), { pergunta: true, planoIds: null })
  assert.deepEqual(perguntaDeBeneficios('Quero saber os benefícios do plano vip', 1), { pergunta: true, planoIds: ['vip'] })
  assert.deepEqual(perguntaDeBeneficios('o que o básico cobre?', 1), { pergunta: true, planoIds: ['basico'] })
  assert.deepEqual(perguntaDeBeneficios('o que tá incluso no do seu jeito', 1), { pergunta: true, planoIds: ['do-seu-jeito'] })
  assert.equal(perguntaDeBeneficios('quais benefícios? e o rastreador vem incluso? e o guincho como funciona? e se eu bater?', 1).pergunta, false)
  assert.equal(perguntaDeBeneficios('quais beneficios', 2).pergunta, false)
  assert.equal(perguntaDeBeneficios('gostei do vip', 1).pergunta, false)
})

test('lista INTEIRA pelo codigo: 18 itens do VIP, o que nao entra, PDF e proximo passo', () => {
  const vip = planoParaListar(fatos.planos, ['vip'])!
  const m = mensagemBeneficios({ abertura: null, plano: vip, pdfUrl: 'https://21go.site/api/pdfs/x', temOutros: true })
  assert.equal((m.match(/✅/g) || []).length, 18)
  assert.match(m, /o plano VIP \(R\$ 227,41\/mês\) cobre:/)
  assert.match(m, /api\/pdfs\/x/)
  assert.match(m, /faz mais sentido pra você, ou quer que eu compare/)
  const basico = planoParaListar(fatos.planos, ['basico'])!
  assert.match(mensagemBeneficios({ abertura: null, plano: basico, pdfUrl: 'u', temOutros: true }), /não entra nesse plano: carro amigo/)
  // um plano so: o unico, mesmo que ele cite outro nome (Compass so tem Especiais e ele disse "vip")
  assert.equal(planoParaListar(compass.planos, ['vip'])?.id, 'especial')
  assert.match(mensagemBeneficios({ abertura: null, plano: compass.planos[0], pdfUrl: 'u', temOutros: false }), /siga com a sua ativação nesse plano/)
  // varios planos e nenhum citado: pergunta qual
  assert.equal(planoParaListar(fatos.planos, null), null)
  assert.equal(mensagemQualPlano(fatos.planos), 'de qual plano você quer ver a cobertura completa: Básico ou VIP?')
})

test('quanto ele paga hoje vira fato calculado, com as diferencas (11/09/2026 21:13: "650" foi jogado fora)', () => {
  const hist = (...m: [('inbound' | 'outbound'), string][]) => m.map(([direction, content]) => ({ direction, content }))
  assert.equal(valorQuePagaHoje(hist(['outbound', 'e quanto você paga hoje?'], ['inbound', '650'])), 650)
  assert.equal(valorQuePagaHoje(hist(['inbound', 'pago 450 por mês na porto'])), 450)
  assert.equal(valorQuePagaHoje(hist(['inbound', 'tô pagando R$ 389,90 hoje'])), 389.9)
  assert.equal(valorQuePagaHoje(hist(['outbound', 'qual a placa?'], ['inbound', '650'])), null)
  assert.equal(valorQuePagaHoje(hist(['inbound', 'meu carro é 2019'])), null)
  const c = comparacaoComHoje(fatos, 650)
  assert.match(c.linhas[0], /R\$ 650,00/)
  assert.match(c.linhas.find((l) => l.includes('VIP'))!, /R\$ 422,59 a MENOS/)
  assert.ok(c.dinheiro.includes(650) && c.dinheiro.includes(422.59) && c.dinheiro.includes(477.3))
  const caro = comparacaoComHoje(fatos, 150)
  assert.match(caro.linhas.find((l) => l.includes('VIP'))!, /R\$ 77,41 a mais[^\n]*não esconda/)
})

test('retomada pelo momento do cliente, sem repetir e sem nome (12/09/2026 13:43)', () => {
  for (const d of ['ok obrigado', 'Valeu!', 'vou pensar', 'depois te falo', 'vou ver com minha esposa', 'ta bom 🙏🏼', 'blz']) assert.ok(ehDespedida(d), d)
  for (const d of ['ok, e o guincho?', 'obrigado, mas quanto fica o vip?', 'vou pensar em qual plano, me explica o premium']) assert.ok(!ehDespedida(d), d)
  assert.equal(mensagemRetomada({ escolheuPlano: false, jaPerguntouProtecao: false, planoUnico: null }), PERGUNTA_TEM_PROTECAO)
  assert.match(mensagemRetomada({ escolheuPlano: true, jaPerguntouProtecao: true, planoUnico: null }), /separar os documentos/)
  assert.match(mensagemRetomada({ escolheuPlano: false, jaPerguntouProtecao: true, planoUnico: 'Veículos Especiais' }), /olhada na simulação\? se o Veículos Especiais fizer sentido/)
  assert.match(mensagemRetomada({ escolheuPlano: false, jaPerguntouProtecao: false, planoUnico: null, despediuSe: true }), /olhada na simulação/)
  // varios planos: cita o de referencia com o valor (dono, 12/09/2026: "algo que deixa ela mais inteligente")
  assert.match(mensagemRetomada({ escolheuPlano: false, jaPerguntouProtecao: true, planoUnico: null, planoSugerido: { nome: 'VIP', mensal: 227.41 } }), /o VIP ficou em R\$ 227,41\/mês/)
  // nenhuma retomada carrega o nome — quem chama pelo nome e a abertura
  assert.ok(!/possui/.test(PERGUNTA_TEM_PROTECAO))
  assert.ok(jaPerguntouProtecao([{ direction: 'outbound', content: 'Juliano, hoje você possui alguma proteção pro seu veículo?' }]))
  assert.ok(jaPerguntouProtecao([{ direction: 'outbound', content: PERGUNTA_TEM_PROTECAO }]))
  assert.ok(!jaPerguntouProtecao([{ direction: 'inbound', content: 'tenho proteção' }]))
})
