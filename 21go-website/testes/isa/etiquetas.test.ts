import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETIQUETAS,
  normalizarEtiquetas,
  etiquetasParaGravar,
  etiquetaValida,
} from '../../src/lib/isa/etiquetas.regras.ts'

test('as 4 etiquetas que o dono pediu, e so essas (15/09/2026)', () => {
  assert.deepEqual(
    ETIQUETAS.map((e) => e.id),
    ['quente', 'leticya', 'documento', 'vistoria', 'fechou', 'frio'],
  )
  assert.deepEqual(
    ETIQUETAS.map((e) => e.nome),
    ['Quente', 'Falando com Leticya', 'Enviou documento', 'Vistoria', 'Fechou', 'Frio'],
  )
  for (const e of ETIQUETAS) assert.ok(e.cor, e.id)
})

test('so etiqueta conhecida entra, sem repetir e na ordem oficial', () => {
  assert.deepEqual(normalizarEtiquetas(['frio', 'fechou', 'frio', 'inventada', 3]), ['fechou', 'frio'])
  assert.deepEqual(normalizarEtiquetas('frio'), [])
  assert.deepEqual(normalizarEtiquetas([]), [])
  assert.equal(etiquetaValida('documento'), true)
  assert.equal(etiquetaValida('toString'), false)
  assert.equal(etiquetaValida(''), false)
})

test('etiqueta que o dono cortou some da tela sem quebrar nada', () => {
  // Continuam gravadas no banco, mas nao aparecem mais (ChipEtiqueta ignora id desconhecido).
  const cortadas = ['vai_fechar', 'falta_doc', 'avaria', 'sem_retorno']
  assert.deepEqual(normalizarEtiquetas(cortadas), [])
  for (const id of cortadas) assert.equal(etiquetaValida(id), false, id)
  // contato com etiqueta antiga + nova mostra so a nova
  assert.deepEqual(normalizarEtiquetas(['vai_fechar', 'fechou']), ['fechou'])
})

test('"avaria" e estado do worker, nao rotulo: o painel nao pode apaga-la', () => {
  // A etiqueta 'avaria' faz a proxima foto do amassado ir pra Leticya (worker.ts). Ela saiu da
  // tela em 15/09/2026, mas gravar as etiquetas novas nao pode zerar esse estado.
  assert.deepEqual(etiquetasParaGravar(['frio'], ['avaria']), ['frio', 'avaria'])
  assert.deepEqual(etiquetasParaGravar([], ['avaria']), ['avaria'])
  // as outras cortadas nao sobrevivem — so as de sistema
  assert.deepEqual(etiquetasParaGravar([], ['quente', 'sem_retorno']), [])
  assert.deepEqual(etiquetasParaGravar(['fechou'], []), ['fechou'])
  assert.deepEqual(etiquetasParaGravar(['fechou'], null), ['fechou'])
  // e nao duplica se vier nas duas listas
  assert.deepEqual(etiquetasParaGravar(['avaria'], ['avaria']), ['avaria'])
})

test('etiquetas que tiram o contato do "precisa de voce": Frio, Falando com Leticya e Fechou (dono, 16/09/2026)', async () => {
  const { ETIQUETAS_FORA_DA_FILA } = await import('../../src/lib/isa/etiquetas.regras.ts')
  assert.deepEqual([...ETIQUETAS_FORA_DA_FILA].sort(), ['fechou', 'frio', 'leticya'])
})
