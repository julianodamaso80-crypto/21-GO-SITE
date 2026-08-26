/**
 * Scope guard — bloqueia conteudo fora do escopo da 21Go.
 *
 * Regras:
 *   1) Caminhao / carreta / onibus / transporte pesado = BANIDO
 *   2) Frota deve ser interpretada como carros e/ou motos
 *   3) Categoria obrigatoria entre: carros, motos, frotas, educativo
 *   4) Detecta padrao "{tema} em {cidade}" puro (sem dor especifica)
 *
 * Usado por:
 *   - Agente 01 (filtra keywords na origem)
 *   - Agente 02 (decision REJEITAR_FORA_DO_ESCOPO)
 *   - Agente 06 (verifica artigo gerado)
 */
const FORBIDDEN_WORDS = [
  // Caminhao/carga
  'caminhao', 'caminhão', 'caminhoes', 'caminhões',
  'carreta', 'carretas',
  'bitrem', 'bitrens',
  'cavalo mecanico', 'cavalo mecânico',
  'cavalo mecanicos', 'cavalo mecânicos',
  'rodotrem', 'rodotrens',
  // Onibus
  'onibus', 'ônibus', 'micro-onibus', 'micro-ônibus', 'microonibus', 'microônibus',
  // Carga
  'transporte rodoviario de carga', 'transporte rodoviário de carga',
  'transporte de carga', 'frete pesado',
  'transportadora de carga', 'transportadora pesada',
  'caminhao baú', 'caminhão baú', 'caminhao tanque', 'caminhão tanque',
  'caminhao bau', 'caminhão bau',
];

/**
 * Lista de cidades brasileiras frequentes — usado pra detectar pautas "{x} em {cidade}".
 * Nao e blocklist; e usado pra avaliar se o titulo e quase identico a outro mudando so a cidade.
 */
export const CITY_HINTS = [
  'rio de janeiro', 'sao paulo', 'são paulo', 'belo horizonte', 'salvador', 'brasilia', 'brasília',
  'fortaleza', 'curitiba', 'recife', 'porto alegre', 'manaus', 'belem', 'belém',
  'goiania', 'goiânia', 'guarulhos', 'campinas', 'sao luis', 'são luís', 'natal',
  'duque de caxias', 'niteroi', 'niterói', 'nova iguacu', 'nova iguaçu', 'sao goncalo', 'são gonçalo',
  'maceio', 'maceió', 'teresina', 'campo grande', 'cuiaba', 'cuiabá', 'florianopolis', 'florianópolis',
  'aracaju', 'sao bernardo', 'são bernardo', 'osasco', 'sorocaba', 'ribeirao preto', 'ribeirão preto',
  'jacarepagua', 'jacarepaguá', 'barra da tijuca', 'tijuca', 'copacabana', 'ipanema', 'leblon',
  'zona oeste', 'zona norte', 'zona sul', 'baixada fluminense',
];

export interface ScopeViolation {
  reason: string;
  matched: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Retorna null se OK; ou ScopeViolation. */
export function checkScope(text: string): ScopeViolation | null {
  const t = normalize(text);
  for (const w of FORBIDDEN_WORDS) {
    const n = normalize(w);
    // \b nao funciona com acentos — uso match com espacos/punct nos bordados
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`);
    if (re.test(t)) return { reason: 'fora_de_escopo_veiculo_pesado', matched: w };
  }
  return null;
}

/** Detecta se o titulo e uma replica generica trocando cidade. */
export function looksLikeCitySwap(title: string): { city?: string; risky: boolean } {
  const t = normalize(title);
  for (const city of CITY_HINTS) {
    const n = normalize(city);
    if (t.includes(n)) return { city, risky: true };
  }
  return { risky: false };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lista publica do que e proibido — usado em logs/prompts. */
export const SCOPE_RULES_TEXT = `
ESCOPO DA 21GO (operacao SEO):
- VEÍCULOS COBERTOS: carros, motos, frotas de carros e/ou motos.
- VEÍCULOS BANIDOS: caminhao, carreta, onibus, bitrem, cavalo mecanico, rodotrem, micro-onibus, transporte rodoviario de carga, frete pesado, transportadora de carga.
- "Frota" SEMPRE significa frota de carros e/ou motos. Nunca de caminhoes.
- Conteudo "{tema} em {cidade}" sem dor especifica e rejeitado por repetitividade.
- FATO: a 21Go SEMPRE cobrou taxa de adesao (ativacao), paga uma unica vez na
  contratacao e calculada na cotacao. NUNCA escreva nem aprove pauta que diga
  "sem taxa de adesao", "adesao gratuita", "sem custo inicial" ou equivalente —
  e informacao falsa. Adesao "simples/sem burocracia/sem analise de perfil" e
  verdade e pode ser dita; ausencia de COBRANCA nao.
`.trim();

/**
 * Promessa falsa de gratuidade na entrada.
 *
 * 25/08/2026: um artigo inteiro ("protecao veicular sem adesao no RJ") foi publicado
 * afirmando que a 21Go nao cobra adesao — e virou a fonte da Visao Geral de IA do
 * Google, que passou a responder "Nao, a 21Go nao cobra taxa de adesao" citando o
 * proprio 21go.site. A keyword tem volume, entao volta pelo GSC/DataForSEO: o corte
 * precisa ser programatico, nao depender do LLM.
 *
 * So casa quando a negacao esta colada em adesao/ativacao/custo de entrada — "sem
 * burocracia na adesao" e "sem analise de perfil" continuam passando.
 */
const FALSE_PROMISE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(sem|zero|nenhum[ao]?|isen[çct]\w*|n[ãa]o (h[áa]|existe|cobra\w*|paga\w*|tem|possui)|dispensa)\s+(a\s+|de\s+|uma\s+|qualquer\s+)*(taxa\s+de\s+)?(ades[ãa]o|ativa[çc][ãa]o|taxa\s+de\s+entrada|custo\s+inicial|valor\s+inicial|valor\s+de\s+entrada|taxa\s+inicial)/iu,
    reason: 'promessa falsa: a 21Go cobra taxa de adesao/ativacao',
  },
  {
    pattern: /(ades[ãa]o|ativa[çc][ãa]o)\s+(e\s+|é\s+)?(gratuita|gratis|grátis|zero|sem\s+custo|de\s+gra[çc]a)/iu,
    reason: 'promessa falsa: a 21Go cobra taxa de adesao/ativacao',
  },
];

/** Retorna null se OK; ou a promessa falsa encontrada (gratuidade de adesao). */
export function checkFalsePromise(text: string): ScopeViolation | null {
  for (const f of FALSE_PROMISE_PATTERNS) {
    const m = text.match(f.pattern);
    if (m) return { reason: f.reason, matched: m[0] };
  }
  return null;
}
