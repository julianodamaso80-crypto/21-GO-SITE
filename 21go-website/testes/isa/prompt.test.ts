import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarPrompt, RESPOSTAS_PRONTAS, comporResposta, abertura, tirarCumprimento } from '../../src/lib/isa/prompt.regras.ts'
import { montarFatos } from '../../src/lib/isa/fatos.regras.ts'

const fatos = montarFatos({
  marca: 'Honda', modelo: 'CG 160 TITAN', ano: 2026, fipe: 21824, combustivel: null, leilao: false,
  carroApp: false, estado: null, planos: [{ id: 'moto-400', nome: 'VIP Moto até 400cc', mensal: 130.68 }],
  ativacaoReferencia: 249, ativacaoPorPlano: { 'moto-400': 249 }, desconto50: null,
})

test('a IA nao cumprimenta: quem cumprimenta e o codigo, com a hora do Rio', () => {
  const p = montarPrompt({ cumprimento: 'bom dia', primeiroNome: 'Cristina', genero: null, fatos, jaGanhouDesconto: false })
  assert.match(p, /NUNCA cumprimente/)
  assert.match(p, /agora é "bom dia"/)
  assert.equal(abertura('boa tarde', 'Maria'), 'boa tarde, Maria 😃')
  assert.equal(abertura('bom dia', null), 'bom dia 😃')
})

test('se a IA cumprimentar mesmo assim, a linha sai (senao fica "boa tarde" duas vezes)', () => {
  assert.equal(tirarCumprimento('boa tarde rafael\n\nme manda a placa'), 'me manda a placa')
  assert.equal(tirarCumprimento('oi, Maria!\nqual a placa?'), 'qual a placa?')
  assert.equal(tirarCumprimento('a cota é 6%'), 'a cota é 6%')
  // "boa" no meio da frase nao e cumprimento
  assert.equal(tirarCumprimento('essa é uma boa escolha'), 'essa é uma boa escolha')
})

test('moto leva cota de 15% no prompt, nunca 6%', () => {
  const p = montarPrompt({ cumprimento: 'boa tarde', primeiroNome: null, genero: null, fatos, jaGanhouDesconto: false })
  assert.match(p, /cota de participação: 15%/)
  assert.doesNotMatch(p, /cota de participação: 6%/)
})

test('genero desconhecido: pelo nome e sem deduzir; conhecido: senhor/senhora', () => {
  assert.match(montarPrompt({ cumprimento: 'bom dia', primeiroNome: 'Darci', genero: null, fatos, jaGanhouDesconto: false }), /NUNCA deduza pelo nome/)
  assert.match(montarPrompt({ cumprimento: 'bom dia', primeiroNome: null, genero: 'f', fatos, jaGanhouDesconto: false }), /a senhora/)
  assert.match(montarPrompt({ cumprimento: 'bom dia', primeiroNome: null, genero: 'm', fatos, jaGanhouDesconto: false }), /o senhor/)
})

test('sem simulacao: pede a placa e nao passa valor', () => {
  const p = montarPrompt({ cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos: null, jaGanhouDesconto: false })
  assert.match(p, /me manda a placa do veículo que eu consulto pra você/)
  assert.match(p, /não passe nenhum valor sem simulação/)
})

test('resposta pronta sai EXATA pelo codigo, nunca reescrita pela IA', () => {
  assert.equal(comporResposta('cooperativa', ''), RESPOSTAS_PRONTAS.cooperativa)
  assert.match(RESPOSTAS_PRONTAS.cooperativa, /não somos cooperativa, somos proteção patrimonial veicular/)
  assert.match(RESPOSTAS_PRONTAS.cooperativa, /tem regulamento a cumprir/)
  assert.ok(RESPOSTAS_PRONTAS.vipXDoSeuJeito.includes('👇'))
  // cliente perguntou duas coisas: o oficial vem primeiro, o resto depois
  assert.equal(comporResposta('cnh_vencida', 'e o valor fica R$ 437,00'), `${RESPOSTAS_PRONTAS.cnhVencida}\n\ne o valor fica R$ 437,00`)
  assert.equal(comporResposta(null, 'oi'), 'oi')
  // cumprimento sempre antes do texto oficial
  assert.equal(comporResposta('cnh_vencida', '', 'boa tarde, Maria 😃'), `boa tarde, Maria 😃\n\n${RESPOSTAS_PRONTAS.cnhVencida}`)
  assert.equal(comporResposta('inventada', 'oi'), 'oi')
  // robo/xingamento: resposta vazia nao vira um "boa tarde" solto
  assert.equal(comporResposta(null, '', 'boa tarde, Ana 😃'), '')
  assert.equal(comporResposta(null, '   ', 'boa tarde 😃'), '')
  const p = montarPrompt({ cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos, jaGanhouDesconto: false })
  assert.match(p, /coloque a chave em "pronta"/)
})

test('rastreador de moto abaixo de 15 mil nao e embutido; acima e (e nao se comenta)', () => {
  assert.match(montarPrompt({ cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos, jaGanhouDesconto: false }), /JÁ INCLUSO/)
})
