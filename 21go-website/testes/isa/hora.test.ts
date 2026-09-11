import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cumprimento, dentroDoHorario, proximaAbertura } from '../../src/lib/isa/hora.regras.ts'

// O Rio e UTC-3 fixo (sem horario de verao desde 2019). Os instantes abaixo sao UTC.
const rio = (hhmm: string, dia = '2026-09-10') => new Date(`${dia}T${hhmm}:00-03:00`)

test('cumprimento segue a hora do Rio, nao a do servidor (UTC)', () => {
  assert.equal(cumprimento(rio('05:00')), 'bom dia')
  assert.equal(cumprimento(rio('11:59')), 'bom dia')
  assert.equal(cumprimento(rio('12:00')), 'boa tarde')
  assert.equal(cumprimento(rio('17:59')), 'boa tarde')
  assert.equal(cumprimento(rio('18:00')), 'boa noite')
  assert.equal(cumprimento(rio('04:59')), 'boa noite')
})

test('o erro que o dono quer evitar: 10h no Rio ja sao 13h UTC, e continua bom dia', () => {
  const dezDaManha = rio('10:00')
  assert.equal(dezDaManha.getUTCHours(), 13)
  assert.equal(cumprimento(dezDaManha), 'bom dia')
})

test('horario de atendimento 8h ate 22h (22h ja e fora)', () => {
  assert.equal(dentroDoHorario(rio('07:59')), false)
  assert.equal(dentroDoHorario(rio('08:00')), true)
  assert.equal(dentroDoHorario(rio('21:59')), true)
  assert.equal(dentroDoHorario(rio('22:00')), false)
  assert.equal(dentroDoHorario(rio('23:30')), false)
})

test('proxima abertura: de madrugada e hoje as 8h; depois das 22h e amanha as 8h', () => {
  assert.equal(proximaAbertura(rio('03:00')).toISOString(), rio('08:00').toISOString())
  assert.equal(proximaAbertura(rio('23:10')).toISOString(), rio('08:00', '2026-09-11').toISOString())
  // Virada de mes
  assert.equal(proximaAbertura(rio('22:30', '2026-09-30')).toISOString(), rio('08:00', '2026-10-01').toISOString())
})

test('dentro do horario a proxima abertura e agora', () => {
  const agora = rio('15:00')
  assert.equal(proximaAbertura(agora).toISOString(), agora.toISOString())
})
