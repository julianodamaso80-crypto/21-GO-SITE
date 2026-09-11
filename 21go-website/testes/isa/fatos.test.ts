import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarFatos, adesivoPct, ehEletricoOuHibrido } from '../../src/lib/isa/fatos.regras.ts'

const base = {
  marca: 'Jeep',
  modelo: 'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.',
  ano: 2022,
  fipe: 116540,
  combustivel: null,
  leilao: false,
  carroApp: false,
  estado: 'RJ',
  planos: [{ id: 'basico', nome: 'Básico', mensal: 437 }],
  ativacaoReferencia: 557,
  ativacaoPorPlano: { basico: 557 },
  desconto50: null,
}

test('cota: carro 6%, eletrico/hibrido (BYD inclusive) 10%, moto 15% — deduzida, nunca perguntada', () => {
  assert.equal(montarFatos(base).cotaPct, 6)
  assert.equal(montarFatos({ ...base, marca: 'BYD', modelo: 'KING GS 1.5 16V Aut. (Hibrido)' }).cotaPct, 10)
  assert.equal(montarFatos({ ...base, marca: 'BYD', modelo: 'DOLPHIN MINI' }).cotaPct, 10)
  assert.equal(montarFatos({ ...base, marca: 'Toyota', modelo: 'COROLLA CROSS XRX 1.8 HYBRID' }).cotaPct, 10)
  assert.equal(
    montarFatos({ ...base, marca: 'Honda', modelo: 'CG 160 TITAN', planos: [{ id: 'moto-400', nome: 'VIP Moto até 400cc', mensal: 130 }] }).cotaPct,
    15,
  )
})

test('eletrico pelo combustivel do Power, mesmo sem palavra no modelo', () => {
  assert.equal(ehEletricoOuHibrido({ marca: 'Volvo', modelo: 'EX30 Ultra', combustivel: 'ELÉTRICO' }), true)
  assert.equal(ehEletricoOuHibrido({ marca: 'Chevrolet', modelo: 'ONIX 1.0', combustivel: 'FLEX' }), false)
})

test('indenizacao 100% da FIPE; leilao/remarcado 80%', () => {
  assert.equal(montarFatos(base).indenizacaoPct, 100)
  assert.equal(montarFatos({ ...base, leilao: true }).indenizacaoPct, 80)
})

test('adesivo igual a tela do site: VIP/Premium/SUV/Especial corta em 30 mil, Basico/Do Seu Jeito em 60 mil, moto nao tem', () => {
  assert.equal(adesivoPct('vip', 30000), 10)
  assert.equal(adesivoPct('vip', 30001), 15)
  assert.equal(adesivoPct('premium', 45000), 15) // a faixa 30-60 mil do Premium segue o site
  assert.equal(adesivoPct('basico', 60000), 10)
  assert.equal(adesivoPct('do-seu-jeito', 60001), 15)
  assert.equal(adesivoPct('moto-400', 20000), null)
})

test('valores do plano: com adesivo e pagando em dia, arredondados como na tela', () => {
  const f = montarFatos(base)
  const p = f.planos[0]
  assert.equal(p.mensal, 437)
  assert.equal(p.adesivoPct, 15)
  assert.equal(p.mensalComAdesivo, 371.45) // o print do dono
  assert.equal(p.mensalEmDia, 415.15)
})

test('carro de aplicativo soma R$ 20 na mensalidade, como a tela', () => {
  assert.equal(montarFatos({ ...base, carroApp: true }).planos[0].mensal, 457)
})

test('rastreador obrigatorio no RJ ja vem embutido: carro > 50 mil, app > 35 mil, moto > 15 mil', () => {
  assert.equal(montarFatos(base).rastreadorEmbutido, true)
  assert.equal(montarFatos({ ...base, fipe: 40000 }).rastreadorEmbutido, false)
  assert.equal(montarFatos({ ...base, fipe: 40000, carroApp: true }).rastreadorEmbutido, true)
  assert.equal(montarFatos({ ...base, estado: 'SP' }).rastreadorEmbutido, false)
})

test('numeros permitidos: tudo que a Isa pode falar, e nada alem', () => {
  const f = montarFatos({ ...base, desconto50: { de: 557, para: 507 } })
  for (const v of [437, 371.45, 415.15, 557, 507, 50, 116540, 100, 19.9, 29.9, 22.9]) {
    assert.ok(f.numerosPermitidos.dinheiro.includes(v), `faltou R$ ${v}`)
  }
  for (const v of [6, 15, 5, 100]) assert.ok(f.numerosPermitidos.pct.includes(v), `faltou ${v}%`)
  assert.ok(!f.numerosPermitidos.dinheiro.includes(352.88), 'valor combinado adesivo+em dia nao e falado')
})

test('cota em reais e valores dos beneficios oficiais tambem sao permitidos', () => {
  const f = montarFatos({
    ...base,
    planos: [{ id: 'vip', nome: 'VIP', mensal: 500, beneficios: [
      { text: 'Danos a Terceiros R$50.000', included: true },
      { text: 'Todos os Vidros', included: false },
    ] }],
    numerosDosBeneficios: [50000],
  })
  assert.equal(f.cotaValor, 6992.4) // 6% de 116.540
  assert.ok(f.numerosPermitidos.dinheiro.includes(6992.4))
  assert.ok(f.numerosPermitidos.dinheiro.includes(50000))
  assert.deepEqual(f.planos[0].cobre, ['Danos a Terceiros R$50.000'])
  assert.deepEqual(f.planos[0].naoCobre, ['Todos os Vidros'])
})

test('planos que a Isa oferece: Especiais sozinho; moto um so; o resto como o Power devolveu', async () => {
  const { planosQueAparecem } = await import('../../src/lib/isa/fatos.regras.ts')
  const ids = (xs: { id: string }[]) => planosQueAparecem(xs).map((p) => p.id)
  assert.deepEqual(ids([{ id: 'basico' }, { id: 'suv' }, { id: 'especial' }]), ['especial'])
  assert.deepEqual(ids([{ id: 'basico' }, { id: 'do-seu-jeito' }, { id: 'especial' }, { id: 'premium' }, { id: 'vip' }]), ['especial'])
  assert.deepEqual(ids([{ id: 'basico' }, { id: 'do-seu-jeito' }, { id: 'vip' }, { id: 'premium' }]), ['basico', 'do-seu-jeito', 'vip', 'premium'])
  assert.deepEqual(ids([{ id: 'basico' }, { id: 'suv' }]), ['basico', 'suv'])
  assert.deepEqual(ids([{ id: 'moto-400' }]), ['moto-400'])
  assert.deepEqual(ids([{ id: 'moto-1000' }]), ['moto-1000'])
  // nunca acrescenta plano que o Power nao mandou
  assert.deepEqual(ids([{ id: 'basico' }]), ['basico'])
})

test('limites do rastreador obrigatorio (R$ 15/35/50 mil) podem ser ditos — sao do gabarito', () => {
  const f = montarFatos(base)
  for (const v of [15000, 35000, 50000]) assert.ok(f.numerosPermitidos.dinheiro.includes(v), `faltou R$ ${v}`)
})

test('Veiculos Especiais tem os mesmos beneficios do VIP (dono, 11/09/2026)', async () => {
  const { planoDosBeneficios } = await import('../../src/lib/isa/fatos.regras.ts')
  assert.equal(planoDosBeneficios('especial'), 'vip')
  assert.equal(planoDosBeneficios('vip'), 'vip')
  assert.equal(planoDosBeneficios('basico'), 'basico')
})

test('indicacao: R$ 50 no pix e 10% no proximo boleto podem ser ditos (dono, 11/09/2026)', () => {
  const f = montarFatos(base)
  assert.ok(f.numerosPermitidos.dinheiro.includes(50), 'R$ 50 da indicacao')
  assert.ok(f.numerosPermitidos.pct.includes(10), '10% da indicacao')
})
