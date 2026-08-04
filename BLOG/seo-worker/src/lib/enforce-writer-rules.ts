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

/**
 * ATENCAO AO \b: em JavaScript, `\b` so enxerga [A-Za-z0-9_]. Como "ô" nao e word
 * character ASCII, `/\b[ôo]nibus\b/` NUNCA casou "ônibus" — casava so "onibus" sem
 * acento. Na pratica o pos-processador deixava passar a palavra acentuada, o artigo
 * chegava ao Reviewer com "ônibus" e era reprovado por escopo, queimando a pauta.
 *
 * A correcao usa lookarounds com classes Unicode (\p{L}) e flag `u`, que respeitam
 * acentos e continuam evitando match dentro de palavra maior ("microônibus" nao casa).
 */
const FORBIDDEN_VEHICLES = [
  { pattern: /(?<![\p{L}\p{N}])caminh(?:ão|ões|ao|oes)(?![\p{L}\p{N}])/giu, replacement: 'carro de carga leve' },
  { pattern: /(?<![\p{L}\p{N}])carretas?(?![\p{L}\p{N}])/giu, replacement: 'utilitario' },
  { pattern: /(?<![\p{L}\p{N}])bitre(?:m|ns)(?![\p{L}\p{N}])/giu, replacement: 'utilitario' },
  { pattern: /(?<![\p{L}\p{N}])cavalo mec[aâ]nico(?![\p{L}\p{N}])/giu, replacement: 'utilitario' },
  { pattern: /(?<![\p{L}\p{N}])(?:micro-?)?[ôo]nibus(?![\p{L}\p{N}])/giu, replacement: 'van' },
  { pattern: /(?<![\p{L}\p{N}])frete pesado(?![\p{L}\p{N}])/giu, replacement: 'entrega' },
  { pattern: /(?<![\p{L}\p{N}])transportadoras?(?![\p{L}\p{N}])/giu, replacement: 'empresa de entrega' },
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
  //
  // NAO usar f.pattern.test() aqui: os regex tem flag /g e sao constantes de modulo,
  // entao o lastIndex sobrevive entre chamadas. Como o Writer chama esta funcao duas
  // vezes (antes e depois do internal-linker), na segunda passada — que e a versao
  // salva no banco — o test() retomava do lastIndex anterior, retornava false e a
  // substituicao era pulada. Foi assim que um artigo com "onibus" chegou ao Reviewer
  // e queimou a pauta. O replace() com /g sempre varre do inicio, entao comparar o
  // antes/depois e suficiente e imune ao estado.
  for (const f of FORBIDDEN_VEHICLES) {
    const substituido = body.replace(f.pattern, f.replacement);
    if (substituido !== body) {
      body = substituido;
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
