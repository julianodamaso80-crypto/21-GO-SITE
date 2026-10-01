/*
 * O env do container da Mariana (Gabriel Juliano). Fixture dos testes de variante e referencia
 * pro /opt/site21go/.env-mariana da Fase 2 — o que nao esta aqui fica no padrao da Isa.
 * Nao termina em .test.ts de proposito: o `node --test` nao roda isto sozinho.
 */
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'

export const ENV_MARIANA: Record<string, string> = {
  BOT_NOME: 'Mariana',
  BOT_NUMERO: '5521966530011',
  BOT_HUMANO_ID: 'gabriel',
  BOT_HUMANO_NOME: 'Gabriel',
  BOT_HUMANO_NOME_COMPLETO: 'Gabriel Juliano',
  BOT_HUMANO_GENERO: 'm',
  BOT_HUMANO_TELEFONE: '5521990954964',
  BOT_HUMANO_APELIDO: 'Gabriel',
  BOT_DONO_POR: 'gabriel',
  POWERCRM_DEFAULT_SLSMN_NW_ID: 'XDmAbx6D',
  WA_WABA_ID: '1387797460178079',
  WA_PHONE_ID: '1308557115675774',
  ISA_ALERTA_PARA: '5521990954964',
  BOT_INSTANCIA: 'cloud_mariana',
  BOT_SCHEMA: 'mariana',
  BOT_SITE_URL: 'https://mariana.21go.site',
  BOT_LEAD_ORIGEM: 'mariana_whatsapp',
  BOT_TRK_PREFIXO: 'mariana',
  BOT_LEADS_5MIN_ORIGENS: '*',
  BOT_LEADS_5MIN_DOMINIOS: '21go.app',
  BOT_SEM_ETIQUETAS: 'guilherme',
}

export const MARIANA = identidadeDoAmbiente(ENV_MARIANA)
