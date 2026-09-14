import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehModeloExcluido, decidirElegibilidade } from '../../src/lib/elegibilidade.regras.ts'

/*
 * Fiat Idea: ordem do dono em 08/09/2026, depois de um Idea ELX 2009 (placa HJG6I52,
 * FIPE R$ 26.624) sair cotado com quatro planos e o cliente escolher o Premium.
 */

test('o Idea do print: cotado pelo Power, barrado aqui', () => {
  assert.equal(
    decidirElegibilidade({
      ano: 2009,
      powerAoVivo: true, // o Power DEU plano — e ainda assim nao fazemos
      allowlist: true,
      marca: 'Fiat',
      modelo: 'Idea ELX 1.4 mpi Fire Flex 8V 5p',
    }).acao,
    'nao_fazemos',
  )
})

test('a descricao inteira no modelo, sem marca separada, tambem barra', () => {
  assert.equal(ehModeloExcluido(null, 'Fiat Idea Adventure 1.8 16V Flex'), true)
})

test('grafia "Ideia" tambem barra', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Ideia ELX'), true)
})

test('so a palavra inteira: nada de casar por pedaco', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Idealle 1.0'), false)
  assert.equal(ehModeloExcluido('Chevrolet', 'Ideario Sport'), false)
})

test('outros Fiat continuam passando', () => {
  assert.equal(ehModeloExcluido('Fiat', 'Palio ELX 1.4'), false)
  assert.equal(ehModeloExcluido('Fiat', 'Uno Mille Fire Flex'), false)
  assert.equal(ehModeloExcluido('Fiat', 'Punto Attractive 1.4'), false)
})

test('sem marca nem modelo nao barra ninguem', () => {
  assert.equal(ehModeloExcluido(null, null), false)
  assert.equal(ehModeloExcluido('', ''), false)
})

test('a exclusao vence o Power, igual ao corte de ano e ao BYD de leilao', () => {
  const v = decidirElegibilidade({
    ano: 2015,
    powerAoVivo: true,
    allowlist: true,
    marca: 'Fiat',
    modelo: 'Idea',
  })
  assert.deepEqual(v, { acao: 'nao_fazemos', motivo: 'modelo_excluido' })
})

/*
 * Chevrolet Meriva: ordem do dono em 10/09/2026, com um Meriva Maxx 1.4 2012 na mao —
 * "nenhum meriva faz".
 */

test('o Meriva do print: cotado pelo Power, barrado aqui', () => {
  assert.deepEqual(
    decidirElegibilidade({
      ano: 2012,
      powerAoVivo: true,
      allowlist: true,
      marca: 'GM - Chevrolet',
      modelo: 'Meriva Maxx 1.4 MPFI 8V ECONOFLEX 5p',
    }),
    { acao: 'nao_fazemos', motivo: 'modelo_excluido' },
  )
})

test('qualquer Meriva barra, com ou sem marca separada', () => {
  assert.equal(ehModeloExcluido('Chevrolet', 'MERIVA JOY 1.8 MPFI 8V FLEXPOWER'), true)
  // 12/09/2026: "nao fazemos esse carro" — o Prius que a Isa cotou pra Leticya
  assert.equal(ehModeloExcluido('Toyota', 'PRIUS 1.8 16V 5p Aut. (Híbrido)'), true)
  assert.equal(ehModeloExcluido('Toyota', 'COROLLA XEI 2.0'), false)
  assert.equal(ehModeloExcluido(null, 'GM - Chevrolet Meriva Premium 1.8 Easytronic'), true)
})

test('outros Chevrolet continuam passando', () => {
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Onix 1.0 Flex 8V 5p'), false)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Spin LTZ 1.8'), false)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'Corsa Hatch Maxx 1.4'), false)
})

test('Power mudo com modelo excluido: barra antes de mandar pro consultor', () => {
  const v = decidirElegibilidade({
    ano: 2015,
    powerAoVivo: null,
    allowlist: null,
    marca: 'Fiat',
    modelo: 'Idea',
  })
  assert.equal(v.acao, 'nao_fazemos')
})

test('moto de leilao/remarcada: o site tambem nao faz (dono, 12/09/2026)', () => {
  const base = { ano: 2022, powerAoVivo: true, allowlist: true, marca: 'Honda', modelo: 'CG 160 TITAN' }
  assert.deepEqual(decidirElegibilidade({ ...base, moto: true, origem: 'leilao' }), { acao: 'nao_fazemos', motivo: 'moto_leilao' })
  assert.deepEqual(decidirElegibilidade({ ...base, moto: true, origem: 'remarcado' }), { acao: 'nao_fazemos', motivo: 'moto_leilao' })
  // moto normal e carro de leilao seguem normalmente
  assert.equal(decidirElegibilidade({ ...base, moto: true, origem: 'nao' }).acao, 'cotar')
  assert.equal(decidirElegibilidade({ ...base, moto: false, origem: 'leilao' }).acao, 'cotar')
})

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * A LISTA do dono (14/09/2026). Ordem: *"chegou um veiculo, voce consulta essa lista; se
 * tiver na lista, ja segue que nao faz; depois consulta o Power"*.
 *
 * Os nomes abaixo sao os do catalogo do Power, conferidos contra as 6.900 versoes.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

test('marca inteira na lista barra qualquer versao dela', () => {
  for (const [marca, modelo] of [
    ['Land Rover', 'Discovery 4 SE 3.0 4x4 TDV6 Diesel'],
    ['Audi', 'A3 Sedan 1.4 TFSI Flex Tiptronic 4p'],
    ['Suzuki', 'Jimny 4ALL 1.3 16V 4x4 Mec.'],
    ['MINI', 'Cooper S 2.0 16V TB Aut.'],
    ['smart', 'Fortwo Coupé 1.0 Mhd'],
    ['JAC', 'T40 1.5 16V Flex Aut.'],
    ['Volvo', 'XC60 T5 Momentum 2.0'],
    ['Lexus', 'NX 300h 2.5 16V Aut.'],
    ['CHANGAN', 'MINI STAR CS 1.0 8V 53cv (Pick-Up)'],
  ]) {
    assert.equal(ehModeloExcluido(marca, modelo), true, `${marca} ${modelo} tinha que barrar`)
  }
})

/*
 * O contrario e o erro caro: recusar veiculo que a 21Go FAZ. Cada um destes foi pego por um
 * padrao solto ao escrever a lista, medido contra o catalogo em 14/09/2026.
 */
test('nome parecido de OUTRA marca nao pode barrar', () => {
  for (const [marca, modelo] of [
    // "MINI" pegava o Dolphin Mini — e BYD todos fazem (dono, 14/09/2026).
    ['BYD', 'Dolphin Mini GL'],
    ['BYD', 'Dolphin Mini GS (Elétrico)'],
    // "smart" pegava o acabamento Smart do Creta.
    ['Hyundai', 'Creta Smart 1.6 16V Flex Aut.'],
    // "500" da Fiat pegava cilindrada de moto e quadriciclo.
    ['HONDA', 'CB 500 HORNET'],
    ['BRP', 'can-am Outlander L 500 4X4 Quadric'],
    // "CC" dos conversiveis da Peugeot pegava estes (o JAC E-JV CC tambem, mas esse barra
    // pela linha "JAC: Todos", nao pelo CC).
    ['Maserati', 'Spyder CC 4.2 V8 32V 390cv'],
    ['FEVER', 'NEXTEM FN1000 CC (Elétrico)'],
  ]) {
    assert.equal(ehModeloExcluido(marca, modelo), false, `${marca} ${modelo} tinha que passar`)
  }
})

test('"Blazer" e a S10 antiga: TrailBlazer e Blazer EV continuam', () => {
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'S10 Blazer Colina 2.4/2.4 MPFI F.P'), true)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'TRAILBLAZER LTZ 3.6 V6 Aut.'), false)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'BLAZER EV RS 347cv (Elétrico)'), false)
})

test('os "exceto" da lista escapam', () => {
  // "CAOA CHERRY: Todos (Exceto Tiggo)"
  assert.equal(ehModeloExcluido('Caoa Chery/Chery', 'ARRIZO 6 PRO 1.5 Turbo Flex Aut.'), true)
  assert.equal(ehModeloExcluido('Caoa Chery/Chery', 'TIGGO 5X TXS 1.5 Turbo Flex Aut.'), false)
  // "C4 todos (exceto Cactus)"
  assert.equal(ehModeloExcluido('Citroën', 'C4 GLX 2.0 Flex 16V 5p Aut.'), true)
  assert.equal(ehModeloExcluido('Citroën', 'C4 Cactus Feel 1.6 Flex Aut.'), false)
})

test('corte por ano: so a geracao velha sai', () => {
  // "Tracker ate 2013"
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'TRACKER LTZ 1.8 16V Flex Aut.', 2013), true)
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'TRACKER Premier 1.0 Turbo 12V Aut.', 2022), false)
  // "EcoSport (ate 2012)"
  assert.equal(ehModeloExcluido('Ford', 'EcoSport XLT 2.0/ 2.0 Flex 16V 5p Aut.', 2011), true)
  assert.equal(ehModeloExcluido('Ford', 'EcoSport FREESTYLE 1.5 12V Flex 5p Aut.', 2020), false)
})

test('sem ano, o corte por ano nao barra — a lista do formulario nao sabe o ano ainda', () => {
  assert.equal(ehModeloExcluido('GM - Chevrolet', 'TRACKER LTZ 1.8 16V Flex Aut.'), false)
  assert.equal(ehModeloExcluido('Ford', 'EcoSport XLT 2.0 Flex'), false)
})

test('"Sport" no nome nao e a linha "FORD: Sport" — esses Ford continuam', () => {
  assert.equal(ehModeloExcluido('Ford', 'Ka Sport 1.6 8V Flex 3p', 2010), false)
  assert.equal(ehModeloExcluido('Ford', 'Ranger XLS SPORT 2.3 16V 150cv CS', 2015), false)
  assert.equal(ehModeloExcluido('Ford', 'Fiesta Sport 1.6 16V Flex Mec.', 2014), false)
})

test('Mitsubishi: so a L200 Outdoor que a linha escreve', () => {
  assert.equal(ehModeloExcluido('Mitsubishi', 'L200 OUTDOOR GLS 2.5 4x4 Diesel', 2011), true)
  assert.equal(ehModeloExcluido('Mitsubishi', 'L200 T.OUTDOOR HPE 2.5 4x4', 2012), true)
  assert.equal(ehModeloExcluido('Mitsubishi', 'Lancer 2.0 16V 160cv Aut.', 2014), true)
  assert.equal(ehModeloExcluido('Mitsubishi', 'L200 Triton Sport HPE 2.4', 2020), false)
  assert.equal(ehModeloExcluido('Mitsubishi', 'Pajero TR4 2.0 16V 4x4 Flex', 2013), false)
})

test('Peugeot: os numeros da lista e os conversiveis', () => {
  assert.equal(ehModeloExcluido('Peugeot', '408 Sedan Allure 2.0 Flex 16V 4p Aut.', 2012), true)
  assert.equal(ehModeloExcluido('Peugeot', '307 CC 2.0 16V 2p Aut.', 2008), true)
  assert.equal(ehModeloExcluido('Peugeot', '308 CC Roland Garros 1.6 Turbo16V 2p Aut', 2013), true)
  // 208, 2008 e 3008 nao estao na lista
  assert.equal(ehModeloExcluido('Peugeot', '208 Griffe 1.6 16V Flex Aut.', 2018), false)
  assert.equal(ehModeloExcluido('Peugeot', '2008 Allure 1.6 Flex Aut.', 2019), false)
})

test('a lista vence o Power, como o corte de ano', () => {
  assert.deepEqual(
    decidirElegibilidade({
      ano: 2013,
      powerAoVivo: true, // o Power COTA a Aircross — e ainda assim nao fazemos
      allowlist: true,
      marca: 'Citroën',
      modelo: 'AIRCROSS GLX 1.6 Flex 16V 5p Aut.',
    }),
    { acao: 'nao_fazemos', motivo: 'modelo_excluido' },
  )
})

test('o resto do catalogo segue passando', () => {
  for (const [marca, modelo, ano] of [
    ['VW - VolksWagen', 'Gol 1.0 Flex 12V 5p', 2018],
    ['VW - VolksWagen', 'T-Cross Comfortline 200 TSI', 2022],
    ['Toyota', 'COROLLA XEI 2.0', 2019],
    ['Hyundai', 'HB20 Comfort 1.0 12V Flex', 2021],
    ['Honda', 'Civic Sedan LXS 1.8 Flex', 2011],
    ['Fiat', 'Palio ELX 1.4', 2012],
    ['GM - Chevrolet', 'Onix 1.0 Flex 8V 5p', 2020],
    ['Jeep', 'Renegade Longitude 1.8 Flex Aut.', 2019],
  ] as [string, string, number][]) {
    assert.equal(ehModeloExcluido(marca, modelo, ano), false, `${marca} ${modelo} tinha que passar`)
  }
})
