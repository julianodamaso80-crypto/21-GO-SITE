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
 * REGRA: o BANCO manda. Este espelho so entra quando a consulta FALHA (nunca
 * quando ela responde "nao existe").
 *
 * O `status` aqui e copia fiel do banco — inclusive `pendente`. Espelho NUNCA
 * promove ninguem a `ativo`: quem poe site no ar e o webhook do Asaas, depois
 * do pagamento confirmado (ver REGRA 0 no CLAUDE.md). Copiar um `pendente` como
 * `ativo` seria liberar site sem pagamento pela porta dos fundos.
 *
 * COMO ATUALIZAR — cole a saida desta consulta, sem editar status na mao:
 *
 *   select slug, nome, whatsapp, powerlink_id, status, ocultar_ativacao
 *     from sites_consultor order by slug;
 *
 * Espelho velho nao quebra nada enquanto o banco estiver de pe: ele so e lido
 * quando o banco cai.
 *
 * Ultima leitura: 2026-08-14 (14 sites).
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
    status: 'pendente',
    ocultarAtivacao: false,
  },
  brunoferreirasoares: {
    slug: 'brunoferreirasoares',
    nome: 'Bruno ferreira Soares',
    whatsapp: '5521982206531',
    powerlinkId: 'zDxM7WYr',
    status: 'pendente',
    ocultarAtivacao: false,
  },
  cleitonmoura: {
    slug: 'cleitonmoura',
    nome: 'Cleiton Moura',
    whatsapp: '5573999977792',
    powerlinkId: 'OERB66WE',
    status: 'pendente',
    ocultarAtivacao: false,
  },
  elienaigomes: {
    slug: 'elienaigomes',
    nome: 'Elienai Galdino Gomes',
    whatsapp: '5521992689955',
    powerlinkId: 'RE0KX6Zr',
    status: 'pendente',
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
  gustavo21go: {
    slug: 'gustavo21go',
    nome: 'Luiz Gustavo Rodrigues Gomes',
    whatsapp: '5521981693332',
    powerlinkId: 'XDmd05aq',
    status: 'pendente',
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
    ocultarAtivacao: true,
  },
  regionalgustavosantos: {
    slug: 'regionalgustavosantos',
    nome: 'Gustavo Santos',
    whatsapp: '5521973234213',
    powerlinkId: 'RD8lOPxD',
    status: 'pendente',
    ocultarAtivacao: false,
  },
  rogevalone: {
    slug: 'rogevalone',
    nome: 'ROGE VALONE',
    whatsapp: '5521991809353',
    powerlinkId: 'VDlm3nYr',
    status: 'ativo',
    ocultarAtivacao: false,
  },
}
