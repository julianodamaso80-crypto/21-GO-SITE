import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoAvisoByd } from '../src/lib/vigia-byd.regras.ts'

const paulo = {
  nome: 'Paulo Henrique Rocha Coqueiro',
  telefone: '5513981546522',
  modelo: 'Dolphin EV GS (Elétrico)',
  ano: 2027,
  plano: 'Veículos Especiais',
  valor: 669.52,
  criadoEm: new Date('2026-09-26T04:25:09Z'),
  clicouWhatsapp: true,
}

test('o aviso traz o que a equipe precisa pra chamar o cliente, na hora do Rio', () => {
  const t = textoAvisoByd([paulo], new Date('2026-09-15T22:24:03Z'))
  assert.match(t, /BYD sem mensagem do 4824 \(1\)/)
  assert.match(t, /Paulo Henrique Rocha Coqueiro · 5513981546522/)
  assert.match(t, /Dolphin EV GS \(Elétrico\) 2027 · Veículos Especiais R\$\s?669,52/)
  assert.match(t, /simulou 26\/09 01:25 · clicou no WhatsApp/)
  assert.match(t, /Última mensagem registrada no 4824: 15\/09 19:24\./)
})

test('varios leads numa mensagem so, e sem ultima mensagem nao quebra', () => {
  const t = textoAvisoByd([paulo, { ...paulo, nome: null, plano: null, clicouWhatsapp: false }], null)
  assert.match(t, /\(2\)/)
  assert.match(t, /• sem nome · 5513981546522\n  Dolphin EV GS \(Elétrico\) 2027\n/)
  assert.match(t, /nenhuma nos últimos 2 dias/)
})
