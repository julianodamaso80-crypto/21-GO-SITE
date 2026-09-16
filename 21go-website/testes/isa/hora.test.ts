import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cumprimento, dentroDoHorario, proximaAbertura, precisaCumprimentar } from '../../src/lib/isa/hora.regras.ts'

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

test('horario de atendimento 7h ate 22h (22h ja e fora) — dono, 15/09/2026', () => {
  assert.equal(dentroDoHorario(rio('06:59')), false)
  assert.equal(dentroDoHorario(rio('07:00')), true)
  assert.equal(dentroDoHorario(rio('08:00')), true)
  assert.equal(dentroDoHorario(rio('21:59')), true)
  assert.equal(dentroDoHorario(rio('22:00')), false)
  assert.equal(dentroDoHorario(rio('23:30')), false)
})

test('proxima abertura: de madrugada e hoje as 7h; depois das 22h e amanha as 7h', () => {
  assert.equal(proximaAbertura(rio('03:00')).toISOString(), rio('07:00').toISOString())
  assert.equal(proximaAbertura(rio('23:10')).toISOString(), rio('07:00', '2026-09-11').toISOString())
  // Virada de mes
  assert.equal(proximaAbertura(rio('22:30', '2026-09-30')).toISOString(), rio('07:00', '2026-10-01').toISOString())
})

test('cumprimenta no comeco, no primeiro contato do dia e depois de 4 h — nao a cada mensagem', () => {
  assert.equal(precisaCumprimentar(null, rio('10:00')), true)
  assert.equal(precisaCumprimentar(rio('10:00'), rio('10:20')), false)
  assert.equal(precisaCumprimentar(rio('10:00'), rio('14:30')), true)
  // ontem 21h, hoje 8h: dia novo no Rio (mesmo que em UTC ainda fosse "o mesmo dia" em parte)
  assert.equal(precisaCumprimentar(rio('21:00', '2026-09-10'), rio('08:05', '2026-09-11')), true)
})

test('dentro do horario a proxima abertura e agora', () => {
  const agora = rio('15:00')
  assert.equal(proximaAbertura(agora).toISOString(), agora.toISOString())
})

test('primeira mensalidade: fechou do 1 ao 15 vence dia 10 do mes seguinte; do 16 em diante, dia 20 (dono, 16/09/2026)', async () => {
  const { primeiroVencimento } = await import('../../src/lib/isa/hora.regras.ts')
  // exemplos do dono
  assert.equal(primeiroVencimento(new Date('2026-09-16T15:00:00-03:00')), '20/10')
  assert.equal(primeiroVencimento(new Date('2026-09-02T15:00:00-03:00')), '10/10')
  assert.equal(primeiroVencimento(new Date('2026-09-15T23:59:00-03:00')), '10/10')
  assert.equal(primeiroVencimento(new Date('2026-09-30T10:00:00-03:00')), '20/10')
  // virada do ano
  assert.equal(primeiroVencimento(new Date('2026-12-20T10:00:00-03:00')), '20/01')
  // vale o dia no Rio: 16/09 as 22h no Rio ja e 17/09 em UTC, e continua dia 20
  assert.equal(primeiroVencimento(new Date('2026-09-15T22:30:00-03:00')), '10/10')
})
