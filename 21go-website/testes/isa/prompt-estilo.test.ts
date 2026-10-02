import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { montarPrompt } from '../../src/lib/isa/prompt.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const entrada = { cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos: null, jaGanhouDesconto: false }
const tudo = { ...entrada, docs: { recebidos: ['CNH'], faltam: ['comprovante de residência'] } }

test('Isa: o prompt e o mesmo do origin/master, byte a byte (estilo nao mexe nela)', async (t) => {
  let antigo: string
  try {
    antigo = execFileSync('git', ['show', 'origin/master:21go-website/src/lib/isa/prompt.regras.ts'], { encoding: 'utf8' })
  } catch {
    t.skip('sem git/origin/master')
    return
  }
  // as importacoes do arquivo sao so de tipo: a copia roda sozinha fora do repo
  const arq = join(mkdtempSync(join(tmpdir(), 'prompt-master-')), 'prompt.regras.ts')
  writeFileSync(arq, antigo)
  const m = (await import(pathToFileURL(arq).href)) as { montarPrompt: typeof montarPrompt }
  assert.equal(montarPrompt(entrada, IDENTIDADE_ISA), m.montarPrompt(entrada, IDENTIDADE_ISA))
  assert.equal(montarPrompt(tudo, IDENTIDADE_ISA), m.montarPrompt(tudo, IDENTIDADE_ISA))
  assert.equal(montarPrompt(tudo), m.montarPrompt(tudo))
  // a Mariana so muda as duas linhas do estilo
  const semEstilo = { ...MARIANA, estilo: undefined }
  assert.equal(montarPrompt(tudo, semEstilo), m.montarPrompt(tudo, semEstilo))
})

test('Isa: minusculas e emoji, como sempre', () => {
  const p = montarPrompt(tudo, IDENTIDADE_ISA)
  assert.match(p, /\n- minúsculas, frases curtas, sem ponto final\n/)
  assert.match(p, /\n- emojis com moderação: \u{1F603} no cumprimento/u)
  assert.doesNotMatch(p, /letra maiúscula|NUNCA use emoji/)
})

test('Mariana: frase com maiuscula e nunca emoji', () => {
  const p = montarPrompt(tudo, MARIANA)
  assert.match(p, /\n- toda frase começa com letra maiúscula \(o resto normal, nunca tudo em caixa alta\), frases curtas, sem ponto final\n/)
  assert.match(p, /\n- NUNCA use emoji, nem quando um exemplo daqui tiver um\n/)
  assert.doesNotMatch(p, /\n- minúsculas|emojis com moderação/)
})
