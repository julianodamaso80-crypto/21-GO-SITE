import { test } from 'node:test'
import assert from 'node:assert/strict'
import { variaveisDoTemplate, textoDoTemplate, textoDaRetomada } from '../../src/lib/isa/abordagem.regras.ts'
import { MARIANA } from './_mariana.ts'

/*
 * Os templates (resultado_simulacao_isa, duvida_valores_isa) foram criados na WABA da Mariana com
 * o mesmo texto: a regra nao pode ter nada da casa alem do link que o servidor passa.
 */
test('Mariana: os templates dos 5 min e da retomada saem com o link do PDF dela e nada da casa', () => {
  const nv = variaveisDoTemplate({ nome: 'ana paula', marca: 'CHEVROLET', modelo: 'ONIX PLUS 1.0', ano: 2020 })
  assert.deepEqual(nv, ['Ana', 'Chevrolet Onix Plus 2020'])
  const link = `${MARIANA.siteUrl}/api/pdfs/lead_x`
  for (const texto of [textoDoTemplate([...nv!, link]), textoDaRetomada([...nv!, link])]) {
    assert.ok(texto.includes('https://mariana.21go.site/api/pdfs/lead_x'))
    assert.doesNotMatch(texto, /(?<!mariana\.)21go\.site\/api|Leticya|4824|\bIsa\b/)
  }
})

test('Mariana: os 5 min olham o site do Gabriel, de qualquer origem', () => {
  assert.deepEqual(MARIANA.fonte5min, { origens: null, dominios: ['21go.app'] })
})
