/**
 * Teste de calibracao do anti-canibalizacao (Agente 03).
 *
 * Roda contra o corpus REAL de seo.articles. Cada caso declara o resultado esperado:
 *   CANIBAL — ja existe artigo praticamente igual, nao pode virar post novo
 *   NOVO    — assunto que o blog ainda nao cobre, tem que passar
 *
 * Motivo de existir: o threshold antigo (cosine cru >= 0.85) ficava ABAIXO do piso
 * do multilingual-e5-small neste corpus (~0.874), entao 105 dos 113 topics viraram
 * "duplicado" — inclusive assuntos novos. Este teste trava a regressao.
 *
 * Uso: node dist/scripts/test-anti-repetition.js
 */
import { findSimilar, scoreHits, isCannibal, CANNIBAL_THRESHOLD } from '../lib/similarity.js';

interface Caso {
  titulo: string;
  keyword: string;
  esperado: 'CANIBAL' | 'NOVO';
  porque: string;
}

const CASOS: Caso[] = [
  {
    titulo: 'Carros mais roubados RJ: Proteja seu veículo com a 21Go',
    keyword: 'carros mais roubados rj',
    esperado: 'CANIBAL',
    porque: 'existe post identico publicado em 30/06',
  },
  {
    titulo: 'Chassi Remarcado no RJ: Problemas e Proteção Veicular',
    keyword: 'chassi remarcado',
    esperado: 'CANIBAL',
    porque: 'ja existem 4 posts de chassi remarcado',
  },
  {
    titulo: 'Proteção Veicular para Onix, Prisma e Cobalt no RJ: Guia Completo',
    keyword: 'protecao veicular onix',
    esperado: 'CANIBAL',
    porque: 'titulo identico a post existente',
  },
  {
    titulo: 'Motor Remarcado: O Que Significa e Impacta no Rio de Janeiro',
    keyword: 'motor remarcado',
    esperado: 'CANIBAL',
    porque: 'ja existem 2 posts de motor remarcado',
  },
  {
    titulo: 'Isenção de IPVA no RJ: quem tem direito e como solicitar',
    keyword: 'isencao de ipva rj',
    esperado: 'NOVO',
    porque: 'assunto regulatorio que o blog nao cobre',
  },
  {
    titulo: 'Licenciamento 2026 RJ: Guia Completo para Carros e Motos',
    keyword: 'licenciamento 2026 rj',
    esperado: 'NOVO',
    porque: 'calendario/processo de licenciamento nao existe no blog',
  },
  {
    titulo: 'Multa por Dirigir sem CNH no Rio de Janeiro: o que acontece',
    keyword: 'multa dirigir sem cnh rj',
    esperado: 'NOVO',
    porque: 'tema de transito nao coberto',
  },
];

async function main(): Promise<void> {
  console.log(`threshold combinado = ${CANNIBAL_THRESHOLD}\n`);
  let falhas = 0;

  for (const c of CASOS) {
    const probe = `${c.titulo}. ${c.keyword}. categoria: carros`;
    const hits = scoreHits(c.titulo, await findSimilar(probe, 10));
    const cannibal = isCannibal(hits);
    const obtido = cannibal ? 'CANIBAL' : 'NOVO';
    const ok = obtido === c.esperado;
    if (!ok) falhas++;

    const top = hits[0];
    console.log(
      `${ok ? 'OK  ' : 'FALHA'} [${obtido} / esperado ${c.esperado}] ${c.titulo.slice(0, 55)}`,
    );
    console.log(
      `      top1="${top?.title.slice(0, 50) ?? '-'}" cosine=${top?.similarity.toFixed(3) ?? '-'}` +
      ` lexical=${top?.lexical?.toFixed(2) ?? '-'} score=${top?.score?.toFixed(3) ?? '-'}  (${c.porque})`,
    );
  }

  console.log(`\n${CASOS.length - falhas}/${CASOS.length} casos corretos`);
  if (falhas > 0) {
    console.error('CALIBRACAO REPROVADA — nao subir sem ajustar os thresholds');
    process.exit(1);
  }
  console.log('calibracao aprovada');
  process.exit(0);
}

main().catch((e) => {
  console.error('erro:', (e as Error).message);
  process.exit(1);
});
