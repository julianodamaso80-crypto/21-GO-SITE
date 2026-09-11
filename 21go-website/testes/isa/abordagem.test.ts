import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYLOAD_COBRE,
  PAYLOAD_DUVIDA,
  telefoneDeAbordagem,
  variaveisDoTemplate,
  textoDoTemplate,
  planoDoCliente,
  mensagemCobertura,
  mensagemDuvida,
  qualidadeRuim,
  templatePodeSair,
} from '../../src/lib/isa/abordagem.regras.ts'
import { mensagemDesconto50 } from '../../src/lib/isa/dono.regras.ts'

test('so telefone brasileiro completo recebe o template', () => {
  assert.equal(telefoneDeAbordagem('5521992208062'), '5521992208062')
  assert.equal(telefoneDeAbordagem('21992208062'), '5521992208062')
  assert.equal(telefoneDeAbordagem('(21) 99220-8062'), '5521992208062')
  assert.equal(telefoneDeAbordagem('992208062'), null)
  assert.equal(telefoneDeAbordagem(''), null)
  assert.equal(telefoneDeAbordagem(null), null)
})

test('variaveis do template: primeiro nome e veiculo curto, sem nome = nao manda', () => {
  assert.deepEqual(
    variaveisDoTemplate({ nome: 'JULIANO damaso', marca: 'JEEP', modelo: 'COMPASS LONGITUDE 2.0 4x2 Flex 16V Aut.', ano: 2022 }),
    ['Juliano', 'Jeep Compass Longitude 2022'],
  )
  assert.deepEqual(variaveisDoTemplate({ nome: 'ana', marca: 'Honda', modelo: 'CG 160 TITAN', ano: 2026 }), ['Ana', 'Honda CG 160 2026'])
  assert.equal(variaveisDoTemplate({ nome: ' ', marca: 'Fiat', modelo: 'Uno', ano: 2010 }), null)
  assert.equal(variaveisDoTemplate({ nome: 'Rui', marca: null, modelo: null, ano: null }), null)
})

test('o texto gravado no painel e o do template aprovado', () => {
  const t = textoDoTemplate(['Juliano', 'Jeep Compass 2022', 'https://21go.site/api/pdfs/lead_x'])
  assert.match(t, /^Resultado da sua simulação\n\nOlá, Juliano\. Conforme informado no site da 21Go/)
  assert.match(t, /simulação que você fez para o Jeep Compass 2022:\nhttps:\/\/21go\.site\/api\/pdfs\/lead_x\n/)
  assert.match(t, /responda esta mensagem\.$/)
  // texto de utilidade: entrega do resultado, sem convite, sem oferta, sem botao
  assert.doesNotMatch(t, /desconto|oferta|promo|grátis|ganhe|toque|se quiser|\[/i)
  assert.notEqual(PAYLOAD_COBRE, PAYLOAD_DUVIDA)
})

test('plano do cliente: o que ele escolheu na tela; senao o de referencia', () => {
  const planos = [
    { id: 'basico', nome: 'Básico', mensal: 437, ativacao: 557, cobre: ['Roubo e Furto'], naoCobre: [] },
    { id: 'vip', nome: 'VIP', mensal: 507, ativacao: 557, cobre: ['Roubo e Furto', 'Carro reserva'], naoCobre: [] },
  ]
  assert.equal(planoDoCliente(planos, 'básico')?.id, 'basico')
  assert.equal(planoDoCliente(planos, null)?.id, 'vip')
  assert.equal(planoDoCliente(planos, 'Premium')?.id, 'vip')
  assert.equal(planoDoCliente([], 'VIP'), null)
})

test('cobertura: plano, valor, o que cobre e o PDF — tudo do codigo', () => {
  const m = mensagemCobertura({
    abertura: 'boa tarde, Juliano 😃',
    plano: { id: 'vip', nome: 'VIP', mensal: 507, ativacao: 557, cobre: ['Roubo e Furto', 'Colisão'], naoCobre: [] },
    pdfUrl: 'https://21go.site/api/pdfs/lead_x',
  })
  assert.match(m, /^boa tarde, Juliano 😃\n\no seu plano VIP \(R\$ 507,00\/mês\) cobre:/)
  assert.match(m, /✅ Roubo e Furto\n✅ Colisão/)
  assert.match(m, /https:\/\/21go\.site\/api\/pdfs\/lead_x$/)
})

test('duvida: pergunta curta e o desconto sem empurrar o fechamento', () => {
  assert.equal(mensagemDuvida(null), 'claro, me conta qual é a sua dúvida 😃')
  assert.equal(mensagemDuvida('bom dia 😃'), 'bom dia 😃\n\nclaro, me conta qual é a sua dúvida 😃')
  const d = mensagemDesconto50({ de: 557, para: 507 }, { perguntaSeFecha: false })
  assert.match(d, /em vez de pagar R\$ 557,00, você vai pagar R\$ 507,00$/)
  assert.match(mensagemDesconto50({ de: 557, para: 507 }), /quer que eu já siga com a sua proteção\?$/)
})

test('qualidade do numero: amarelo ou vermelho suspende a mensagem dos 5 min', () => {
  assert.equal(qualidadeRuim('GREEN'), false)
  assert.equal(qualidadeRuim('UNKNOWN'), false)
  assert.equal(qualidadeRuim('YELLOW'), true)
  assert.equal(qualidadeRuim('RED'), true)
  assert.equal(qualidadeRuim('red'), true)
})

test('template so sai aprovado e como UTILITY (a Meta recategoriza pra MARKETING)', () => {
  assert.equal(templatePodeSair({ status: 'APPROVED', categoria: 'UTILITY' }), true)
  assert.equal(templatePodeSair({ status: 'APPROVED', categoria: 'MARKETING' }), false)
  assert.equal(templatePodeSair({ status: 'PENDING', categoria: 'UTILITY' }), false)
  assert.equal(templatePodeSair({ status: null, categoria: null }), false)
})
