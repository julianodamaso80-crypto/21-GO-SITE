// Roda com: node testes/whatsapp-cloud.test.ts  (Node 24 remove os tipos sozinho)
import { createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import { assinaturaConfere, mensagensDoNumero, podeResponder } from '../src/lib/whatsapp-cloud.ts'

const SEGREDO = 'segredo-de-teste'
const assinar = (corpo: string, segredo = SEGREDO) =>
  'sha256=' + createHmac('sha256', segredo).update(corpo).digest('hex')

let passou = 0
function caso(nome: string, fn: () => void) {
  fn()
  passou++
  console.log('  ok -', nome)
}

console.log('assinaturaConfere')
const corpo = '{"object":"whatsapp_business_account"}'
caso('aceita assinatura certa', () => assert.equal(assinaturaConfere(corpo, assinar(corpo), SEGREDO), true))
caso('recusa corpo alterado', () => assert.equal(assinaturaConfere(corpo + ' ', assinar(corpo), SEGREDO), false))
caso('recusa segredo errado', () => assert.equal(assinaturaConfere(corpo, assinar(corpo, 'outro'), SEGREDO), false))
caso('recusa sem cabecalho', () => assert.equal(assinaturaConfere(corpo, undefined, SEGREDO), false))
caso('recusa sem prefixo sha256=', () => assert.equal(assinaturaConfere(corpo, assinar(corpo).slice(7), SEGREDO), false))
caso('recusa segredo vazio', () => assert.equal(assinaturaConfere(corpo, assinar(corpo, ''), ''), false))

console.log('mensagensDoNumero')
const ISA = '1457563414097446'
const CRM = '1156510420881777'
const payload = (phoneId: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneId }, ...value } }] }],
})
const texto = payload(ISA, {
  contacts: [{ profile: { name: 'Juliano' }, wa_id: '5521992208062' }],
  messages: [{ from: '5521992208062', id: 'wamid.A', timestamp: '1789076100', type: 'text', text: { body: 'Oie, valor do ônix' } }],
})

caso('extrai texto do numero da Isa', () => {
  const [m] = mensagensDoNumero(texto, ISA)
  assert.deepEqual(m, {
    id: 'wamid.A', from: '5521992208062', nome: 'Juliano', tipo: 'text',
    texto: 'Oie, valor do ônix', mediaId: null, timestamp: '1789076100',
  })
})
caso('ignora mensagem de outro numero (CRM)', () => assert.equal(mensagensDoNumero(texto, CRM).length, 0))
caso('ignora evento so de status', () =>
  assert.equal(mensagensDoNumero(payload(ISA, { statuses: [{ id: 'wamid.A', status: 'read' }] }), ISA).length, 0))
caso('audio vem com mediaId e sem texto', () => {
  const [m] = mensagensDoNumero(payload(ISA, {
    messages: [{ from: '5521992208062', id: 'wamid.B', timestamp: '1', type: 'audio', audio: { id: 'MEDIA1', mime_type: 'audio/ogg' } }],
  }), ISA)
  assert.equal(m.tipo, 'audio')
  assert.equal(m.mediaId, 'MEDIA1')
  assert.equal(m.texto, null)
})
caso('clique em botao vira texto', () => {
  const [m] = mensagensDoNumero(payload(ISA, {
    messages: [{ from: '5521965774240', id: 'wamid.C', timestamp: '1', type: 'button', button: { text: 'Autorizar desconto', payload: 'x' } }],
  }), ISA)
  assert.equal(m.texto, 'Autorizar desconto')
})
caso('payload torto nao explode', () => {
  assert.equal(mensagensDoNumero(null, ISA).length, 0)
  assert.equal(mensagensDoNumero({ entry: 'lixo' }, ISA).length, 0)
})

console.log('podeResponder')
const DONO = '5521992208062'
caso('modo teste: responde a quem esta na allowlist', () =>
  assert.equal(podeResponder(DONO, { modoTeste: 'true', allowlist: DONO }), true))
caso('modo teste: cliente fora da allowlist fica mudo', () =>
  assert.equal(podeResponder('5521999998888', { modoTeste: 'true', allowlist: DONO }), false))
caso('allowlist vazia: ninguem recebe', () =>
  assert.equal(podeResponder(DONO, { modoTeste: 'true', allowlist: '' }), false))
caso('variavel de modo teste sumiu: continua em teste', () =>
  assert.equal(podeResponder('5521999998888', { modoTeste: undefined, allowlist: DONO }), false))
caso('as duas variaveis sumiram: ninguem recebe', () =>
  assert.equal(podeResponder(DONO, { modoTeste: undefined, allowlist: undefined }), false))
caso('allowlist aceita varios numeros e espacos', () =>
  assert.equal(podeResponder('5521965774240', { modoTeste: 'true', allowlist: `${DONO}, 5521965774240` }), true))
caso('so sai do teste com "false" explicito', () =>
  assert.equal(podeResponder('5521999998888', { modoTeste: 'false', allowlist: '' }), true))

console.log(`\n${passou} casos passaram`)
