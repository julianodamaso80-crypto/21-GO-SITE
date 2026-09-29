import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  comDesconto,
  botaoDaPromocao,
  variaveisDaPromocao,
  textoDaPromocao,
  mensagemPedirDocumentos,
  blocoPromocao,
  primeiroNomePromo,
  PAYLOADS_PROMO,
  type Promocao,
} from '../../src/lib/isa/promocao.regras.ts'

const luan: Promocao = { veiculo: 'GM - Chevrolet, ONIX HATCH Joy 1.0 8V Flex 5p Mec. 2019', valorAnterior: 399.99, valorNovo: 239.99, validade: '2026-10-09' }

test('40% so na ativacao, arredondado no centavo', () => {
  assert.equal(comDesconto(399.99), 239.99)
  assert.equal(comDesconto(453.26), 271.96)
  assert.equal(comDesconto(249), 149.4)
  assert.equal(comDesconto(1550), 930)
})

test('botao: o payload vale; texto so quando vem sozinho', () => {
  assert.equal(botaoDaPromocao(['promo40:seguir'], ['Quero seguir']), 'seguir')
  assert.equal(botaoDaPromocao(['promo40:agora_nao'], ['Agora não']), 'agora_nao')
  assert.equal(botaoDaPromocao([], ['Quero seguir']), 'seguir')
  assert.equal(botaoDaPromocao([], ['agora nao']), 'agora_nao')
  assert.equal(botaoDaPromocao([], ['quero seguir, mas qual a mensalidade?']), null)
  assert.equal(botaoDaPromocao(['isa-5min:duvida'], ['Tenho dúvida']), null)
  assert.deepEqual(PAYLOADS_PROMO, ['promo40:seguir', 'promo40:agora_nao'])
})

test('variaveis na ordem do template v18', () => {
  assert.deepEqual(variaveisDaPromocao('Luã', luan), ['Luã', luan.veiculo, '399,99', '239,99', '09/10/2026'])
  const t = textoDaPromocao('Luã', luan)
  assert.match(t, /^Olá, Luã\. Você fez uma cotação com a 21Go/)
  assert.match(t, /Valor anterior: R\$ 399,99\nValor atualizado: R\$ 239,99\nVálido até: 09\/10\/2026/)
})

test('primeiro nome: capitaliza e pula inicial solta', () => {
  assert.equal(primeiroNomePromo('LUÃ DA SILVA'), 'Luã')
  assert.equal(primeiroNomePromo('A SOUZA LIMA'), 'Souza')
  assert.equal(primeiroNomePromo(''), null)
})

test('pedido de documentos com o valor promocional', () => {
  assert.equal(
    mensagemPedirDocumentos('Luã', luan),
    'Perfeito, Luã! Para darmos sequência na ativação com o valor de R$ 239,99, me envie por aqui a foto da sua CNH, o documento do veículo e um comprovante de residência.',
  )
})

test('bloco do prompt traz antes, depois, validade e trava de desconto extra', () => {
  const b = blocoPromocao(luan)
  assert.match(b, /de R\$ 399,99 por R\$ 239,99/)
  assert.match(b, /09\/10\/2026/)
  assert.match(b, /NÃO marque o gatilho "desconto"/)
  assert.match(b, /mensalidade e as coberturas NÃO mudaram/)
})
