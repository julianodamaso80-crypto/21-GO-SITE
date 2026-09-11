import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatoLegivel, lerSaidaMidia, textoDaLeitura, DOC_DE_FECHAMENTO } from '../../src/lib/isa/ler-midia.regras.ts'

test('le foto, print e PDF; video, figurinha e docx ficam de fora', () => {
  assert.equal(formatoLegivel('image/jpeg'), 'imagem')
  assert.equal(formatoLegivel('image/png'), 'imagem')
  assert.equal(formatoLegivel('image/webp'), 'imagem')
  assert.equal(formatoLegivel('application/pdf'), 'pdf')
  assert.equal(formatoLegivel('video/mp4'), null)
  assert.equal(formatoLegivel('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), null)
  assert.equal(formatoLegivel(null), null)
})

test('saida do modelo: tipo desconhecido vira outro, placa so no formato certo, JSON torto nao derruba', () => {
  assert.deepEqual(lerSaidaMidia('{"tipo":"cotacao","resumo":"Porto Seguro, R$ 250/mês","placa":"rkm-7j62"}'), {
    tipo: 'cotacao', resumo: 'Porto Seguro, R$ 250/mês', placa: 'RKM7J62',
  })
  assert.equal(lerSaidaMidia('```json\n{"tipo":"inventado","resumo":"x"}\n```')?.tipo, 'outro')
  assert.equal(lerSaidaMidia('{"tipo":"foto_veiculo","resumo":"","placa":"123"}')?.placa, null)
  assert.equal(lerSaidaMidia('nao e json'), null)
})

test('CNH, CRLV e comprovante sao cliente fechando (transfere); print e foto a Isa responde', () => {
  assert.ok(DOC_DE_FECHAMENTO.has('cnh') && DOC_DE_FECHAMENTO.has('crlv') && DOC_DE_FECHAMENTO.has('comprovante_residencia'))
  assert.ok(!DOC_DE_FECHAMENTO.has('cotacao') && !DOC_DE_FECHAMENTO.has('foto_veiculo') && !DOC_DE_FECHAMENTO.has('print_conversa'))
})

test('o texto lido entra na conversa, com a legenda do cliente se tinha', () => {
  const l = { tipo: 'cotacao' as const, resumo: 'Porto Seguro, R$ 250/mês', placa: null }
  assert.equal(textoDaLeitura(null, l), '📎 cotação/orçamento: Porto Seguro, R$ 250/mês')
  assert.equal(textoDaLeitura('[imagem]', l), '📎 cotação/orçamento: Porto Seguro, R$ 250/mês')
  assert.equal(textoDaLeitura('olha essa', l), 'olha essa\n📎 cotação/orçamento: Porto Seguro, R$ 250/mês')
  assert.equal(textoDaLeitura(null, { tipo: 'foto_veiculo', resumo: 'Onix branco', placa: 'RKM7J62' }), '📎 foto do veículo: Onix branco (placa RKM7J62)')
})
