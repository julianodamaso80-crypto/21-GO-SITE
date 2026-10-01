import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemPedidoDocumentos } from '../../src/lib/isa/entrega.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

test('sem humano, o pedido de documentos e o da Isa de hoje', () => {
  for (const comemorar of [true, false]) {
    for (const faltam of [[], ['a foto da CNH'], ['a foto da CNH', 'um comprovante de residência']]) {
      assert.equal(mensagemPedidoDocumentos(comemorar, faltam, IDENTIDADE_ISA.humano), mensagemPedidoDocumentos(comemorar, faltam))
    }
  }
})

test('Mariana: com tudo em maos, passa pro Gabriel finalizar', () => {
  assert.equal(
    mensagemPedidoDocumentos(false, [], MARIANA.humano),
    'já tenho seus documentos aqui, então vou te passar pro Gabriel finalizar a sua ativação',
  )
  assert.doesNotMatch(mensagemPedidoDocumentos(true, [], MARIANA.humano), /Leticya|4824/)
  // pedido de documento nao depende de quem atende
  assert.equal(mensagemPedidoDocumentos(false, ['a foto da CNH'], MARIANA.humano), mensagemPedidoDocumentos(false, ['a foto da CNH']))
})
