import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeMostrarPopup, mensagemDoPopup, linkDoPopup, DOMINIOS_DA_CASA } from '../../src/lib/isa/popup.regras.ts'
import { entradaPopup } from '../../src/lib/isa/dono.regras.ts'

const base = {
  ligado: true,
  hostname: '21go.site',
  temConsultor: false,
  clicouContratar: false,
  jaViu: false,
  temPlanos: true,
}

test('aparece so nos dois .site da casa', () => {
  assert.equal(podeMostrarPopup(base), true)
  assert.equal(podeMostrarPopup({ ...base, hostname: 'www.21goconsultoraleticya.site' }), true)
  assert.equal(podeMostrarPopup({ ...base, hostname: '21go.com.br' }), false)
  assert.ok(DOMINIOS_DA_CASA.includes('21goconsultoraleticya.site'))
})

test('NUNCA em site de consultor, mesmo no dominio da casa (REGRA 0.1)', () => {
  assert.equal(podeMostrarPopup({ ...base, temConsultor: true }), false)
})

test('quem clicou em "Quero contratar" ja esta com o atendimento: nada de popup', () => {
  assert.equal(podeMostrarPopup({ ...base, clicouContratar: true }), false)
})

test('uma vez por simulacao, so com planos na tela, e so com a chave ligada', () => {
  assert.equal(podeMostrarPopup({ ...base, jaViu: true }), false)
  assert.equal(podeMostrarPopup({ ...base, temPlanos: false }), false)
  assert.equal(podeMostrarPopup({ ...base, ligado: false }), false)
})

test('a mensagem pronta traz tudo e a Isa reconhece a entrada + o lead', () => {
  const msg = mensagemDoPopup({
    nome: 'Juliano Damaso', veiculo: 'Jeep COMPASS 2022', fipe: 116540, plano: 'Básico', mensal: 437,
    ativacao: 557, pdfUrl: 'https://21go.site/api/pdfs/lead_b4a6d7cb5bc1ee3d',
  })
  assert.match(msg, /^Quero meu desconto!\n/)
  assert.doesNotMatch(msg, /\p{Extended_Pictographic}/u)
  assert.match(msg, /Nome: Juliano Damaso/)
  assert.match(msg, /FIPE: R\$ 116\.540,00/)
  assert.match(msg, /Plano: Básico · R\$ 437,00\/mês/)
  assert.match(msg, /Ativação: R\$ 557,00/)
  assert.deepEqual(entradaPopup(msg), { popup: true, leadId: 'lead_b4a6d7cb5bc1ee3d', plano: 'Básico' })
})

test('o link abre o WhatsApp da Isa (98004-0964), nunca o 4824', () => {
  const l = linkDoPopup('Quero meu desconto!')
  assert.match(l, /^https:\/\/wa\.me\/5521980040964\?text=/)
  assert.doesNotMatch(l, /5521969454824/)
})
