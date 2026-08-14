import type { Consultor } from './consultor'

/**
 * Espelho da tabela `sites_consultor`, usado SOMENTE quando o banco falha.
 *
 * Por que existe: em 14/08/2026 o PostgREST do Supabase compartilhado ficou em
 * 503 por horas (pool esgotado, `PGRST002`). Sem este espelho, o lookup de
 * consultor voltava vazio e todo lead das landing pages vendidas era desviado
 * pro numero da casa — em silencio. Site vendido entregando lead pro numero
 * errado e o pior defeito possivel deste produto.
 *
 * REGRA: o BANCO manda. Este espelho so entra quando a consulta falha (nunca
 * quando ela responde "nao existe"). Consequencia aceita: durante uma queda do
 * banco, um cancelamento recente pode continuar no ar por algumas horas. Servir
 * um site cancelado e recuperavel; entregar o lead de um consultor pago pra
 * outra pessoa, nao.
 *
 * COMO ATUALIZAR: ao cadastrar, cancelar ou trocar o numero de um consultor,
 * rode a consulta abaixo e cole o resultado aqui. Espelho velho nao quebra nada
 * enquanto o banco estiver de pe — ele so e lido quando o banco cai.
 *
 *   select slug, nome, whatsapp, powerlink_id, status
 *     from sites_consultor order by slug;
 *
 * Ultima leitura: 2026-08-14.
 */
export const CONSULTORES_FALLBACK: Record<string, Consultor> = {
  andersonagripino: {
    slug: 'andersonagripino',
    nome: 'ANDERSON AGRIPINO',
    whatsapp: '5521978785059',
    powerlinkId: 'PqZx6wNr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  anselmocavalcante: {
    slug: 'anselmocavalcante',
    nome: 'Anselmo da Silva Cavalcante',
    whatsapp: '5521970396300',
    powerlinkId: 'bqYyppoq',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  brunoferreirasoares: {
    slug: 'brunoferreirasoares',
    nome: 'Bruno ferreira Soares',
    whatsapp: '5521982206531',
    powerlinkId: 'zDxM7WYr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  elienaigomes: {
    slug: 'elienaigomes',
    nome: 'Elienai Galdino Gomes',
    whatsapp: '5521992689955',
    powerlinkId: 'RE0KX6Zr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  fabriciosilva: {
    slug: 'fabriciosilva',
    nome: 'Fabricio da Silva',
    whatsapp: '5521970378799',
    powerlinkId: 'bqe7MjWr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  leticyathayene: {
    slug: 'leticyathayene',
    nome: 'Leticya Thayene Nascimento Lima',
    whatsapp: '5521969454824',
    powerlinkId: 'WDVMKnkq',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  manghi: {
    slug: 'manghi',
    nome: 'RAPHAEL MANGHI',
    whatsapp: '5521973857428',
    powerlinkId: '3qyXl7xE',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  marcelolima21go: {
    slug: 'marcelolima21go',
    nome: 'MARCELO LIMA FIEL PINHEIRO',
    whatsapp: '5521994489188',
    powerlinkId: 'bqeAJKoq',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  mayconalves: {
    slug: 'mayconalves',
    nome: 'Maycon Alves',
    whatsapp: '5524999013401',
    powerlinkId: 'lq2OJj0D',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  paivarj21go: {
    slug: 'paivarj21go',
    nome: 'Danilo Paiva de Azevedo',
    whatsapp: '5521969779519',
    powerlinkId: 'VqLRwAvr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
  regionalgustavosantos: {
    slug: 'regionalgustavosantos',
    nome: 'Gustavo Santos',
    whatsapp: '5521973234213',
    powerlinkId: 'RD8lOPxD',
    status: 'ativo',
    ocultarAtivacao: false,
  },
}
