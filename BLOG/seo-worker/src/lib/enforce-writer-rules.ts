/**
 * Pos-processador determinista do Writer (05).
 *
 * Garante que o MDX final cumpra as regras hard do Reviewer (06):
 *   - >=3 CTAs (links pra /cotacao ou /protecao-veicular)
 *   - >=3 links internos (incluindo /protecao-veicular E /cotacao obrigatorios)
 *   - sem menções a caminhao/onibus/carreta/transporte pesado (substitui por "veiculo leve")
 *
 * Idempotente: se ja cumpre, retorna o MDX original. Se falta, injeta um bloco
 * "## Como a 21Go te protege" antes do FAQ com os links/CTAs faltantes.
 *
 * Retorna o MDX corrigido + lista de mudancas aplicadas (pra logar).
 */

const FORBIDDEN_VEHICLES = [
  { pattern: /\bcaminh(?:ão|oes|ao|ões)\b/gi, replacement: 'carro de carga leve' },
  { pattern: /\bcarretas?\b/gi, replacement: 'utilitario' },
  { pattern: /\bbitrem\b/gi, replacement: 'utilitario' },
  { pattern: /\bcavalo mec[aâ]nico\b/gi, replacement: 'utilitario' },
  { pattern: /\b[ôo]nibus\b/gi, replacement: 'van' },
  { pattern: /\bfrete pesado\b/gi, replacement: 'entrega' },
  { pattern: /\btransportadora\b/gi, replacement: 'empresa de entrega' },
];

const ENFORCED_SECTION_HEADING = '## Como a proteção veicular 21Go funciona';
const ENFORCED_SECTION_BODY = [
  '',
  ENFORCED_SECTION_HEADING,
  '',
  'A 21Go atua há mais de 20 anos com proteção patrimonial veicular no Rio de Janeiro. Diferente de seguro tradicional, funciona por mutualismo: todos os associados contribuem mensalmente e quando alguém sofre um sinistro (roubo, furto, colisão), o fundo cobre.',
  '',
  'Quer entender se a [proteção patrimonial veicular](/protecao-veicular) da 21Go cobre seu caso? Faça uma [cotação gratuita em 30 segundos](/cotacao) e veja o valor pro seu veículo. Em caso de dúvida, consulte nossas [perguntas frequentes](/faq) ou [fale com um consultor](/cotacao) sem compromisso.',
  '',
].join('\n');

interface EnforceResult {
  mdx: string;
  changes: string[];
  was_modified: boolean;
}

export function enforceWriterRules(mdx: string): EnforceResult {
  const changes: string[] = [];
  let body = mdx;

  // 1) Remove menções a veiculos pesados (substitui pra evitar escopo violado)
  for (const f of FORBIDDEN_VEHICLES) {
    if (f.pattern.test(body)) {
      body = body.replace(f.pattern, f.replacement);
      changes.push(`substituido veiculo-pesado por '${f.replacement}'`);
    }
  }

  // Separa frontmatter pra contar links so no body
  const fmMatch = /^(---\n[\s\S]+?\n---\n+)/.exec(body);
  const frontmatter = fmMatch ? fmMatch[1] ?? '' : '';
  let contentBody = fmMatch ? body.slice(frontmatter.length) : body;

  // 2) Conta CTAs e links internos
  const countInternalLinks = (s: string) => Array.from(s.matchAll(/\]\((\/[^)]+)\)/g)).map((m) => m[1]!);
  const links = countInternalLinks(contentBody);
  const hasProtecao = links.some((u) => u.startsWith('/protecao-veicular'));
  const hasCotacao = links.some((u) => u.startsWith('/cotacao'));
  const hasFaq = links.some((u) => u.startsWith('/faq'));
  const ctaLinkCount = links.filter((u) => /^\/(cotacao|protecao-veicular)/.test(u)).length;

  const needsInjection =
    links.length < 3 ||
    !hasProtecao ||
    !hasCotacao ||
    !hasFaq ||
    ctaLinkCount < 3;

  if (needsInjection) {
    // Injeta o bloco enforced antes da seção "## Perguntas frequentes" (FAQ).
    // Se nao tem FAQ section, injeta no final.
    const faqIdx = contentBody.search(/^##\s*Perguntas frequentes/im);
    if (faqIdx > 0) {
      contentBody = contentBody.slice(0, faqIdx) + ENFORCED_SECTION_BODY + '\n' + contentBody.slice(faqIdx);
      changes.push('bloco enforced injetado antes do FAQ (CTAs/links garantidos)');
    } else {
      contentBody = contentBody.trimEnd() + '\n' + ENFORCED_SECTION_BODY;
      changes.push('bloco enforced injetado no final (sem FAQ section detectada)');
    }
  }

  return {
    mdx: frontmatter + contentBody,
    changes,
    was_modified: changes.length > 0,
  };
}
