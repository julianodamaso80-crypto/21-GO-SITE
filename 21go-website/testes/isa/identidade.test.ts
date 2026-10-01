import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  identidadeDoAmbiente,
  IDENTIDADE_ISA,
  tabelasDoBot,
  leadsDoBot,
  leadEhDoBot,
  atendimentoDoPdf,
  indicacaoDoBot,
  nomesDoCumprimento,
  telefoneBonitoDe,
  telefoneCurtoDe,
  numeroBonitoDe,
  LEADS_DE_PARCEIRO,
} from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA, MARIANA } from './_mariana.ts'

test('sem env nenhum, a identidade e a Isa de hoje, valor por valor', () => {
  assert.deepEqual(identidadeDoAmbiente({}), {
    nome: 'Isa',
    numero: '5521980040964',
    numeroBonito: '98004-0964',
    humano: {
      id: 'leticya',
      nome: 'Leticya',
      nomeCompleto: 'Leticya Thayene',
      genero: 'f',
      telefone: '5521969454824',
      telefoneBonito: '+55 21 96945-4824',
      telefoneCurto: '21 96945-4824',
      apelido: '4824',
    },
    donoPor: 'juliano',
    powerlink: 'WDVMKnkq',
    waba: '932143313296745',
    instancia: 'cloud_isa',
    schema: 'public',
    siteUrl: 'https://21go.site',
    painelUrl: 'https://21go.site/painel',
    leadOrigem: 'isa_whatsapp',
    trkPrefixo: 'isa',
    fonte5min: {
      origens: ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro'],
      dominios: ['21go.site', '21goconsultoraleticya.site'],
    },
    semEtiquetas: [],
    daCasa: true,
  })
  assert.deepEqual(IDENTIDADE_ISA, identidadeDoAmbiente({}))
})

test('a casa continua respeitando o env que ja existia (WA_WABA_ID, POWERCRM_DEFAULT_SLSMN_NW_ID)', () => {
  const id = identidadeDoAmbiente({ WA_WABA_ID: '111', POWERCRM_DEFAULT_SLSMN_NW_ID: 'abc' })
  assert.equal(id.waba, '111')
  assert.equal(id.powerlink, 'abc')
  assert.equal(id.daCasa, true)
})

test('Mariana: Gabriel, schema mariana, instancia cloud_mariana, WABA e Power dele', () => {
  assert.equal(MARIANA.nome, 'Mariana')
  assert.equal(MARIANA.numero, '5521966530011')
  assert.equal(MARIANA.numeroBonito, '96653-0011')
  assert.deepEqual(MARIANA.humano, {
    id: 'gabriel',
    nome: 'Gabriel',
    nomeCompleto: 'Gabriel Juliano',
    genero: 'm',
    telefone: '5521990954964',
    telefoneBonito: '+55 21 99095-4964',
    telefoneCurto: '21 99095-4964',
    apelido: 'Gabriel',
  })
  assert.equal(MARIANA.donoPor, 'gabriel')
  assert.equal(MARIANA.powerlink, 'XDmAbx6D')
  assert.equal(MARIANA.waba, '1387797460178079')
  assert.equal(MARIANA.instancia, 'cloud_mariana')
  assert.equal(MARIANA.schema, 'mariana')
  assert.equal(MARIANA.siteUrl, 'https://mariana.21go.site')
  assert.equal(MARIANA.painelUrl, 'https://mariana.21go.site/painel')
  assert.equal(MARIANA.leadOrigem, 'mariana_whatsapp')
  assert.equal(MARIANA.trkPrefixo, 'mariana')
  assert.deepEqual(MARIANA.fonte5min, { origens: null, dominios: ['21go.app'] })
  assert.deepEqual(MARIANA.semEtiquetas, ['guilherme'])
  assert.equal(MARIANA.daCasa, false)
})

test('identidade que embola com a casa nao sobe', () => {
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_SCHEMA: 'public' }), /schema/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, WA_WABA_ID: '' }), /WABA/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, POWERCRM_DEFAULT_SLSMN_NW_ID: '' }), /Power/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_HUMANO_TELEFONE: '' }), /humano/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_LEAD_ORIGEM: '' }), /origem/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_TRK_PREFIXO: '' }), /trk/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_NUMERO: '' }), /numero/)
  // a instancia da casa nunca sai do schema public
  assert.throws(() => identidadeDoAmbiente({ BOT_SCHEMA: 'mariana' }), /casa/)
  // so valor seguro entra no SQL
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_SCHEMA: 'mariana; drop table x' }), /schema/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_INSTANCIA: "x' or 1=1" }), /instancia/)
})

test('telefone: bonito, curto e o numero do proprio bot', () => {
  assert.equal(telefoneBonitoDe('5521969454824'), '+55 21 96945-4824')
  assert.equal(telefoneCurtoDe('5521990954964'), '21 99095-4964')
  assert.equal(numeroBonitoDe('5521980040964'), '98004-0964')
  assert.equal(numeroBonitoDe('5521966530011'), '96653-0011')
  assert.equal(telefoneBonitoDe('abc'), 'abc')
})

test('tabelas por-bot qualificadas pelo schema', () => {
  assert.deepEqual(tabelasDoBot('public'), {
    contatos: 'public.isa_contatos',
    eventos: 'public.isa_eventos',
    config: 'public.isa_config',
    promocoes: 'public.isa_promocoes',
    recrutamento: 'public.consultor_recrutamento',
  })
  assert.equal(tabelasDoBot(MARIANA.schema).contatos, 'mariana.isa_contatos')
  assert.equal(tabelasDoBot(MARIANA.schema).recrutamento, 'mariana.consultor_recrutamento')
})

test('leads do bot: a Isa ve todos menos os da Mariana; a Mariana so os dela', () => {
  assert.deepEqual(leadsDoBot(IDENTIDADE_ISA), {
    incluirOrigens: null,
    incluirDominios: [],
    excluirOrigens: ['mariana_whatsapp'],
    excluirDominios: ['21go.app'],
  })
  assert.deepEqual(leadsDoBot(MARIANA), {
    incluirOrigens: ['mariana_whatsapp'],
    incluirDominios: ['21go.app'],
    excluirOrigens: [],
    excluirDominios: [],
  })
  // as marcas de parceiro sao exatamente as da Mariana
  assert.deepEqual([...LEADS_DE_PARCEIRO.origens], [MARIANA.leadOrigem])
  assert.deepEqual([...LEADS_DE_PARCEIRO.dominios], [...MARIANA.fonte5min.dominios])

  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.site' }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'isa_whatsapp', dominio: null }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'power_crm' }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'mariana_whatsapp', dominio: null }, IDENTIDADE_ISA), false)
  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.app' }, IDENTIDADE_ISA), false)
  assert.equal(leadEhDoBot({ origem: 'mariana_whatsapp' }, MARIANA), true)
  assert.equal(leadEhDoBot({ origem: 'qualquer', dominio: '21go.app' }, MARIANA), true)
  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.site' }, MARIANA), false)
})

test('PDF: lead da Mariana sai com o Gabriel; na Isa nada muda', () => {
  assert.equal(atendimentoDoPdf({ origem: 'mariana_whatsapp' }, IDENTIDADE_ISA), null)
  assert.equal(atendimentoDoPdf({ origem: 'site_organico', dominio: '21go.site' }, IDENTIDADE_ISA), null)
  assert.deepEqual(atendimentoDoPdf({ origem: 'mariana_whatsapp' }, MARIANA), {
    nome: 'Gabriel Juliano',
    whatsappUrl: 'https://wa.me/5521990954964',
  })
  assert.deepEqual(atendimentoDoPdf({ origem: 'x', dominio: '21go.app' }, MARIANA)?.whatsappUrl, 'https://wa.me/5521990954964')
  assert.equal(atendimentoDoPdf({ origem: 'site_organico', dominio: '21go.site' }, MARIANA), null)
})

test('indicacao do "Quero ser consultor" e nomes que viram cumprimento', () => {
  assert.equal(indicacaoDoBot(IDENTIDADE_ISA), 'da consultora Leticya Thayene')
  assert.equal(indicacaoDoBot(MARIANA), 'do consultor Gabriel Juliano')
  assert.deepEqual(nomesDoCumprimento(IDENTIDADE_ISA), ['isa', 'leticya'])
  assert.deepEqual(nomesDoCumprimento(MARIANA), ['mariana', 'gabriel'])
})
