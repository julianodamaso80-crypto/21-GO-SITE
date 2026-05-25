/**
 * Insere keywords manuais (carros/motos) pra destravar o pipeline quando
 * o estoque dessas categorias zera entre rodadas semanais do DataForSEO.
 *
 * As keywords entram como source='manual', status='pending'.
 * O proximo /runs/weekly vai pegar elas e gerar topics+briefings.
 */
import { query, exec, closePool } from '../db/pg.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const SEEDS: Array<{ keyword: string; category: 'carros' | 'motos'; intent: 'informational' | 'commercial' }> = [
  // CARROS
  { keyword: 'protecao veicular para carro novo zero km', category: 'carros', intent: 'commercial' },
  { keyword: 'protecao veicular para carro hibrido eletrico', category: 'carros', intent: 'informational' },
  { keyword: 'protecao veicular carro de luxo vale a pena', category: 'carros', intent: 'commercial' },
  { keyword: 'carro alugado tem protecao veicular', category: 'carros', intent: 'informational' },
  // MOTOS
  { keyword: 'protecao veicular para moto esportiva', category: 'motos', intent: 'commercial' },
  { keyword: 'protecao para moto custom harley royal enfield', category: 'motos', intent: 'commercial' },
  { keyword: 'moto de aluguel mottu tem protecao', category: 'motos', intent: 'informational' },
  { keyword: 'protecao veicular para scooter eletrica', category: 'motos', intent: 'informational' },
];

async function main() {
  let inserted = 0;
  for (const s of SEEDS) {
    const norm = s.keyword.toLowerCase();
    const exists = await query<{ id: string }>(
      `SELECT id FROM seo.keywords WHERE company_id=$1 AND keyword_normalized=$2`,
      [config.COMPANY_ID, norm],
    );
    if (exists.length > 0) {
      logger.info({ keyword: s.keyword }, 'ja existe — pulando');
      continue;
    }
    await exec(
      `INSERT INTO seo.keywords (company_id, keyword, category, source, intent, status)
       VALUES ($1, $2, $3, 'manual', $4, 'pending')`,
      [config.COMPANY_ID, s.keyword, s.category, s.intent],
    );
    inserted++;
    logger.info({ keyword: s.keyword, category: s.category }, 'inserida');
  }
  logger.info({ inserted, total: SEEDS.length }, 'concluido');
  await closePool();
}
main().catch((e) => { logger.fatal({ err: (e as Error).message }, 'fatal'); process.exit(1); });
