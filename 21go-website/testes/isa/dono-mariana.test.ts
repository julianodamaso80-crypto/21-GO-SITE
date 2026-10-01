import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemTransferencia, mensagemRobo } from '../../src/lib/isa/dono.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const MOTIVOS = ['avaria', 'documento', 'associado', 'sem_preco', 'byd', 'manual']

test('sem humano, o texto e o da Isa de hoje (Leticya, 4824)', () => {
  for (const motivo of MOTIVOS) {
    assert.equal(mensagemTransferencia({ motivo }, IDENTIDADE_ISA.humano), mensagemTransferencia({ motivo }), motivo)
  }
  for (const genero of ['m', 'f', null] as const) {
    assert.equal(mensagemRobo({ genero }, IDENTIDADE_ISA.humano), mensagemRobo({ genero }))
  }
})

test('Mariana: transferencia pro Gabriel, no numero dele, no masculino', () => {
  const doc = mensagemTransferencia({ motivo: 'documento' }, MARIANA.humano)
  assert.match(doc, /^vou te passar pro Gabriel, que vai finalizar com você 🙏🏼/)
  assert.match(doc, /é só chamar ele nesse número 👇\n\+55 21 99095-4964$/)
  assert.match(mensagemTransferencia({ motivo: 'avaria' }, MARIANA.humano), /^vou passar as fotos pro Gabriel avaliar e ele já te responde/)
  assert.match(mensagemTransferencia({ motivo: 'sem_preco' }, MARIANA.humano), /^vou pedir pro Gabriel fazer a cotação/)
  assert.match(
    mensagemTransferencia({ motivo: 'byd' }, MARIANA.humano),
    /^quem cuida da proteção do seu BYD é o Gabriel, ele vai te atender pessoalmente/,
  )
  for (const motivo of MOTIVOS) {
    const m = mensagemTransferencia({ motivo }, MARIANA.humano)
    assert.doesNotMatch(m, /Leticya|4824|\bela\b|pra Gabriel|wa\.me|https/, motivo)
  }
})

test('Mariana: "voce e robo?" oferece o Gabriel', () => {
  const m = mensagemRobo({ genero: null }, MARIANA.humano)
  assert.match(m, /^sou uma atendente virtual inteligente/)
  assert.match(m, /falar direto com o Gabriel, é só chamar nesse número 👇\n\+55 21 99095-4964$/)
  assert.doesNotMatch(m, /Leticya|4824/)
})
