import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerJsonTolerante, escaparControlesEmStrings } from '../../src/lib/isa/json.regras.ts'

const NL = String.fromCharCode(10)
const TAB = String.fromCharCode(9)
const BARRA_N = '\\n' // os dois caracteres: barra e n

test('JSON com quebra de linha crua dentro da string (o que o Pro faz em 24/45 e o Flash em 1/45)', () => {
  const bruto = `{"resposta": "a cota é 6%${NL}${NL}só paga se for arrumar", "pronta": null, "gatilho": null}`
  assert.throws(() => JSON.parse(bruto))
  const j = lerJsonTolerante(bruto)!
  assert.equal(j.resposta, `a cota é 6%${NL}${NL}só paga se for arrumar`)
  assert.equal(j.gatilho, null)
})

test('cerca de markdown, texto em volta e tab', () => {
  assert.equal(lerJsonTolerante('```json' + NL + '{"resposta": "ok"}' + NL + '```')!.resposta, 'ok')
  assert.equal(lerJsonTolerante('aqui está:' + NL + `{"resposta": "oi${TAB}você"}` + NL + 'fim')!.resposta, `oi${TAB}você`)
  assert.equal(escaparControlesEmStrings(`{"a": "x${NL}y", "b": 1}`), `{"a": "x${BARRA_N}y", "b": 1}`)
  // escape que ja existia nao e escapado duas vezes
  assert.equal(escaparControlesEmStrings(`{"a": "x${BARRA_N}y"}`), `{"a": "x${BARRA_N}y"}`)
})

test('ultimo recurso: pega os campos mesmo com JSON quebrado depois; sem "resposta" devolve null', () => {
  const j = lerJsonTolerante('{"resposta": "pode fazer normalmente", "gatilho": "sem_comprovante", "leilao": true, "app": false, "sem_placa": {oops')!
  assert.equal(j.resposta, 'pode fazer normalmente')
  assert.equal(j.gatilho, 'sem_comprovante')
  assert.equal(j.leilao, true)
  assert.equal(j.app, false)
  assert.equal(lerJsonTolerante('nada a ver'), null)
  assert.equal(lerJsonTolerante(''), null)
})
