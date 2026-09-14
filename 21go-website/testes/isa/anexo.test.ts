import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tipoDeAnexo,
  nomeDoAnexo,
  anexoRecusado,
  LIMITE_IMAGEM,
  LIMITE_DOCUMENTO,
} from '../../src/lib/isa/envio.regras.ts'

test('a Meta so aceita jpeg, png e webp como imagem', () => {
  assert.equal(tipoDeAnexo('image/png'), 'image')
  assert.equal(tipoDeAnexo('image/jpeg'), 'image')
  assert.equal(tipoDeAnexo('image/webp'), 'image')
  assert.equal(tipoDeAnexo('IMAGE/JPEG'), 'image')
  assert.equal(tipoDeAnexo('image/jpeg; charset=binary'), 'image')
})

test('o HEIC do iPhone vai como documento — como imagem a Meta recusa', () => {
  assert.equal(tipoDeAnexo('image/heic'), 'document')
  assert.equal(tipoDeAnexo('image/heif'), 'document')
  assert.equal(tipoDeAnexo('application/pdf'), 'document')
  assert.equal(tipoDeAnexo('image/gif'), 'document')
  assert.equal(tipoDeAnexo(''), 'document')
  assert.equal(tipoDeAnexo(null), 'document')
})

test('o nome do arquivo e o que o cliente le no balao', () => {
  assert.equal(nomeDoAnexo('boleto-setembro.pdf', 'document'), 'boleto-setembro.pdf')
  // Alguns navegadores mandam o caminho inteiro
  assert.equal(nomeDoAnexo('C:\\Users\\damas\\Desktop\\print.png', 'image'), 'print.png')
  assert.equal(nomeDoAnexo('/var/tmp/apolice.pdf', 'document'), 'apolice.pdf')
  assert.equal(nomeDoAnexo('', 'image'), 'imagem.jpg')
  assert.equal(nomeDoAnexo(null, 'document'), 'arquivo')
})

test('arquivo vazio ou grande demais volta com o motivo escrito pro atendente', () => {
  assert.equal(anexoRecusado({ tamanho: 0, tipo: 'image' }), 'arquivo vazio')
  assert.equal(anexoRecusado({ tamanho: 1024, tipo: 'image' }), null)
  assert.equal(anexoRecusado({ tamanho: LIMITE_IMAGEM, tipo: 'image' }), null)
  assert.match(anexoRecusado({ tamanho: LIMITE_IMAGEM + 1, tipo: 'image' }) ?? '', /5 MB para imagem/)
  // O mesmo arquivo de 6 MB passa como documento
  assert.equal(anexoRecusado({ tamanho: LIMITE_IMAGEM + 1, tipo: 'document' }), null)
  assert.match(anexoRecusado({ tamanho: LIMITE_DOCUMENTO + 1, tipo: 'document' }) ?? '', /16 MB para documento/)
})
