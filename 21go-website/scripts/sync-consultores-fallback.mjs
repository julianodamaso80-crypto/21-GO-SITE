/**
 * Regera `src/lib/consultores-fallback.ts` a partir da tabela `sites_consultor`.
 *
 *   npm run sync:consultores
 *
 * Por que existe: o espelho e a rede de seguranca que impede o lead de um site
 * vendido de cair no numero da casa quando o Supabase cai. Manter esse arquivo
 * na mao ja produziu status errado e `ocultarAtivacao` trocado, e as vendas
 * entram o dia inteiro — o arquivo envelhece em horas. Gerar e mais barato e
 * mais seguro do que conferir linha a linha.
 *
 * O script NAO muda status de ninguem: ele copia o banco como esta, `pendente`
 * inclusive. Quem poe site no ar e o webhook do Asaas, depois do pagamento
 * confirmado (REGRA 0 do CLAUDE.md).
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (o `.env.local`
 * local costuma vir sem a service key — nesse caso rode dentro do container:
 *   ssh <servidor> 'docker exec site21go node -e "..."'
 * ou exporte as duas variaveis antes de chamar).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL_BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !KEY) {
  console.error('ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  process.exit(1)
}

const DESTINO = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib',
  'consultores-fallback.ts',
)

const res = await fetch(
  `${URL_BASE}/rest/v1/sites_consultor?select=slug,nome,whatsapp,powerlink_id,status,ocultar_ativacao&order=slug`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
)

if (!res.ok) {
  // Falhar alto de proposito: sobrescrever o espelho com resposta parcial
  // deixaria consultores de fora, e e justamente numa queda de banco que ele e
  // lido. Melhor manter o arquivo anterior.
  console.error('ERRO: Supabase respondeu', res.status, (await res.text()).slice(0, 200))
  process.exit(1)
}

const linhas = await res.json()
if (!Array.isArray(linhas) || linhas.length === 0) {
  console.error('ERRO: a tabela voltou vazia — nao vou sobrescrever o espelho.')
  process.exit(1)
}

const q = (v) => JSON.stringify(String(v ?? ''))
const hoje = new Date().toISOString().slice(0, 10)

const corpo = linhas
  .map((r) =>
    [
      `  ${r.slug}: {`,
      `    slug: ${q(r.slug)},`,
      `    nome: ${q(r.nome)},`,
      `    whatsapp: ${q(r.whatsapp)},`,
      `    powerlinkId: ${q(r.powerlink_id)},`,
      `    status: ${q(r.status)},`,
      `    ocultarAtivacao: ${r.ocultar_ativacao ? 'true' : 'false'},`,
      `  },`,
    ].join('\n'),
  )
  .join('\n')

const arquivo = `import type { Consultor } from './consultor'

/**
 * Espelho da tabela \`sites_consultor\`, usado SOMENTE quando o banco falha.
 *
 * ARQUIVO GERADO — nao edite na mao. Regenere com:
 *   npm run sync:consultores
 *
 * REGRA: o BANCO manda. Este espelho so entra quando a consulta FALHA (nunca
 * quando ela responde "nao existe"). O \`status\` e copia fiel — \`pendente\`
 * inclusive. Espelho NUNCA promove ninguem a \`ativo\`: quem poe site no ar e o
 * webhook do Asaas, depois do pagamento (REGRA 0 do CLAUDE.md).
 *
 * Ultima geracao: ${hoje} (${linhas.length} sites).
 */
export const CONSULTORES_FALLBACK: Record<string, Consultor> = {
${corpo}
}
`

writeFileSync(DESTINO, arquivo)
const ativos = linhas.filter((r) => r.status === 'ativo').length
console.log(`espelho regerado: ${linhas.length} sites (${ativos} ativos, ${linhas.length - ativos} nao ativos)`)
