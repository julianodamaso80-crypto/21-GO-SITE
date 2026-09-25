import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETAPAS, ehEtapa, etapaDoCard, etapaCompativel, etiquetasAoMover } from '../../src/lib/isa/funil.regras.ts'
import { ETIQUETAS } from '../../src/lib/isa/etiquetas.regras.ts'

test('o funil comeca no Simulou e termina no Frio (dono, 15/09/2026)', () => {
  assert.deepEqual(
    ETAPAS.map((e) => e.id),
    ['simulou', 'quente', 'leticya', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'],
  )
  // a coluna "Novo" saiu: quem nao simulou tambem entra no Simulou
  assert.equal(ehEtapa('novo'), false)
  assert.equal(ehEtapa('simulou'), true)
  assert.equal(ehEtapa('qualquer'), false)
  for (const e of ETAPAS) assert.ok(e.rotulo && e.cor, e.id)
})

test('as colunas depois do Simulou sao exatamente as etiquetas, com o mesmo id', () => {
  assert.deepEqual(
    ETAPAS.map((e) => e.id).filter((id) => id !== 'simulou'),
    ETIQUETAS.map((e) => e.id),
  )
  for (const e of ETAPAS) {
    if (e.id === 'simulou') continue
    const tag = ETIQUETAS.find((t) => t.id === e.id)
    assert.equal(e.rotulo, tag?.nome, e.id)
  }
})

test('sem escolha manual, a etapa vem do que ja aconteceu', () => {
  const base = { etapa: null, escolheuPlano: false, mandouDocumento: false }
  assert.equal(etapaDoCard(base), 'simulou')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true }), 'leticya')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true, mandouDocumento: true }), 'documento')
})

test('o que a pessoa arrastou vence sempre (dono, 11/09/2026)', () => {
  assert.equal(etapaDoCard({ etapa: 'frio', escolheuPlano: true, mandouDocumento: true }), 'frio')
  assert.equal(etapaDoCard({ etapa: 'fechou', escolheuPlano: false, mandouDocumento: false }), 'fechou')
  // etapa invalida no banco nao quebra a tela: cai na automatica
  assert.equal(etapaDoCard({ etapa: 'lixo', escolheuPlano: false, mandouDocumento: false }), 'simulou')
})

test('card que ficou na coluna antiga nao se perde ao trocar o funil', () => {
  assert.equal(etapaCompativel('novo'), 'simulou')
  assert.equal(etapaCompativel('escolheu'), 'leticya')
  assert.equal(etapaCompativel('documentos'), 'documento')
  // "vistoria" voltou a ser coluna (dono, 16/09/2026)
  assert.equal(etapaCompativel('vistoria'), 'vistoria')
  assert.equal(etapaCompativel('fechado'), 'fechou')
  assert.equal(etapaCompativel('perdido'), 'frio')
  assert.equal(etapaCompativel('lixo'), null)
  assert.equal(etapaCompativel(null), null)
  // quem foi arrastado pra uma coluna antiga aparece na nova, sem precisar arrastar de novo
  assert.equal(etapaDoCard({ etapa: 'perdido', escolheuPlano: true, mandouDocumento: true }), 'frio')
})

test('a etiqueta anda com o funil: pos a tag, o card vai pra coluna (dono, 16/09/2026)', () => {
  const base = { etapa: null, escolheuPlano: false, mandouDocumento: false }
  assert.equal(etapaDoCard({ ...base, etiquetas: ['fechou'] }), 'fechou')
  // a tag vence o que foi arrastado antes e o que o fluxo calculou
  assert.equal(etapaDoCard({ etapa: 'leticya', escolheuPlano: true, mandouDocumento: true, etiquetas: ['fechou'] }), 'fechou')
  // varias tags: vale a mais adiantada no funil
  assert.equal(etapaDoCard({ ...base, etiquetas: ['leticya', 'documento'] }), 'documento')
  assert.equal(etapaDoCard({ ...base, etiquetas: ['documento', 'fechou', 'leticya'] }), 'fechou')
  // tag que nao e coluna (avaria, de sistema) nao mexe
  assert.equal(etapaDoCard({ ...base, mandouDocumento: true, etiquetas: ['avaria'] }), 'documento')
  // sem tag: continua como antes
  assert.equal(etapaDoCard({ ...base, etiquetas: [] }), 'simulou')
})

test('mover o card acerta as etiquetas pra coluna nova', () => {
  // pra frente: ganha a tag da coluna e guarda as de antes
  assert.deepEqual(etiquetasAoMover(['leticya'], 'fechou'), ['leticya', 'fechou'])
  // pra tras: perde as tags das colunas que ficaram a frente
  assert.deepEqual(etiquetasAoMover(['leticya', 'documento', 'fechou'], 'documento'), ['leticya', 'documento'])
  assert.equal(etapaDoCard({ etapa: null, escolheuPlano: false, mandouDocumento: false, etiquetas: ['documento', 'vistoria'] }), 'vistoria')
  // de volta pro Simulou: sai toda tag de coluna, a de sistema fica
  assert.deepEqual(etiquetasAoMover(['leticya', 'avaria'], 'simulou'), ['avaria'])
  // sem repetir
  assert.deepEqual(etiquetasAoMover(['fechou'], 'fechou'), ['fechou'])
  // e o card fica mesmo na coluna escolhida
  for (const destino of ['simulou', 'quente', 'leticya', 'documento', 'vistoria', 'fechou', 'frio']) {
    const tags = etiquetasAoMover(['quente', 'leticya', 'documento', 'vistoria', 'fechou', 'frio'], destino)
    assert.equal(etapaDoCard({ etapa: destino, escolheuPlano: true, mandouDocumento: true, etiquetas: tags }), destino, destino)
  }
})

test('quem veio pelo Quero Ser Consultor vai pra coluna Consultores, depois do Fechou (dono, 21/09/2026)', () => {
  assert.equal(ETAPAS.find((e) => e.id === 'consultor')?.rotulo, 'Consultores')
  assert.equal(etapaDoCard({ etapa: null, escolheuPlano: false, mandouDocumento: false, etiquetas: ['consultor'] }), 'consultor')
})

test('"ja cuidei" some da aba, mas sinal novo traz de volta (dono, 25/09/2026)', async () => {
  const { voltaPraPrecisaDeVoce } = await import('../../src/lib/isa/funil.regras.ts')
  assert.equal(voltaPraPrecisaDeVoce({ pergunta_pendente: { texto: 'quanto fica?', em: 'x' } }), true)
  assert.equal(voltaPraPrecisaDeVoce({ aguardando_dono: 'desconto' }), true)
  // a pausa da propria Isa (gatilho) chama o time; a chave do painel, nao (dono, 25/09/2026)
  assert.equal(voltaPraPrecisaDeVoce({ ligada: false, pausa_por: 'isa' }), true)
  assert.equal(voltaPraPrecisaDeVoce({ ligada: false, pausa_por: 'leticya' }), false)
  assert.equal(voltaPraPrecisaDeVoce({ ligada: false }), false)
  // o que nao e sinal novo nao traz de volta
  assert.equal(voltaPraPrecisaDeVoce({ pergunta_pendente: null }), false)
  assert.equal(voltaPraPrecisaDeVoce({ aguardando_dono: null }), false)
  assert.equal(voltaPraPrecisaDeVoce({ ligada: true }), false)
  assert.equal(voltaPraPrecisaDeVoce({ nota: 'cliente pediu pra ligar amanha' }), false)
})
