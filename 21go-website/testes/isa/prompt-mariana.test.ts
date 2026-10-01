import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarPrompt,
  comporResposta,
  respostasProntas,
  RESPOSTAS_PRONTAS,
  gabaritoDe,
  GABARITO_21GO,
} from '../../src/lib/isa/prompt.regras.ts'
import { validarNumeros, numerosOficiais } from '../../src/lib/isa/validador.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const entrada = { cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos: null, jaGanhouDesconto: false }
const tudo = { ...entrada, docs: { recebidos: ['CNH', 'documento do veículo', 'comprovante de residência'], faltam: [] } }

test('sem bot, o prompt, o gabarito e as prontas sao os da Isa de hoje', () => {
  assert.equal(montarPrompt(entrada, IDENTIDADE_ISA), montarPrompt(entrada))
  assert.equal(montarPrompt(tudo, IDENTIDADE_ISA), montarPrompt(tudo))
  assert.equal(gabaritoDe(IDENTIDADE_ISA.humano), GABARITO_21GO)
  assert.deepEqual(respostasProntas(IDENTIDADE_ISA), { ...RESPOSTAS_PRONTAS })
  assert.match(RESPOSTAS_PRONTAS.ligacao, /da minha supervisora: leticya, 21 96945-4824/)
})

test('Mariana: o prompt e dela, do time do Gabriel, sem Leticya', () => {
  const p = montarPrompt(tudo, MARIANA)
  assert.match(p, /^você é a Mariana, do time do Gabriel, na 21Go Proteção Patrimonial Veicular/)
  assert.match(p, /é assim que o Gabriel atende/)
  assert.match(p, /o Gabriel responde e já puxa o próximo passo/)
  assert.match(p, /se não falta nenhum, diga que já tem tudo e que vai passar pro Gabriel finalizar/)
  assert.match(p, /quando ele escolher o plano, diga que já tem tudo e que vai passar pro Gabriel finalizar/)
  assert.match(p, /o contato do Gabriel\)/)
  assert.match(p, /quando ele mandar, o Gabriel avalia/)
  assert.match(p, /"avaria" — o Gabriel avalia e, em muitos casos/)
  assert.doesNotMatch(p, /Leticya|leticya|\bIsa\b|4824/)
})

test('Mariana: "posso te ligar?" passa o Gabriel, e o numero dele passa no validador', () => {
  const r = comporResposta('ligacao', '', null, respostasProntas(MARIANA))
  assert.match(r, /mas vou te passar o contato do meu supervisor: gabriel, 21 99095-4964/)
  assert.match(r, /é só falar que estava falando comigo, a mariana, e que eu te passei o contato$/)
  assert.doesNotMatch(r, /leticya|4824|\bisa\b/i)
  const sem = { dinheiro: [], pct: [] }
  assert.equal(validarNumeros(r, sem, numerosOficiais(MARIANA.humano.telefone)).ok, true)
  // sem a lista do bot, o numero do Gabriel seria barrado como telefone inventado
  assert.equal(validarNumeros(r, sem).ok, false)
})
