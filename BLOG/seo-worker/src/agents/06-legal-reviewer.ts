/**
 * Agente 06 — Legal Commercial Reviewer
 *
 * 2 camadas:
 *   1) Regex hard-block — frases proibidas (cobertura garantida, igual seguro etc).
 *      Se detectar, retorna REPROVADO direto, sem chamar LLM.
 *   2) LLM judge (Sonnet) — avalia tom, escopo, CTA, honestidade, repeticao.
 *      Decide: APROVADO | APROVADO_COM_AJUSTES | REPROVADO + ajustes especificos.
 *
 * Atualiza seo.articles.review_status / review_notes.
 */
import type { Agent } from './_types.js';
import type { ArticleRow, ReviewStatus } from '../db/repositories/articles.js';
import { updateArticle } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { checkScope, checkFalsePromise, SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:06-legal-reviewer');

// Hard-block: padroes inequivocamente proibidos (sem ambiguidade contextual).
// Patterns que dependem de contexto (ex: "aprovação automática", "sem análise"
// podem aparecer NEGADOS em frase honesta "NAO existe aprovacao automatica") sao
// deixados pro LLM judge avaliar — evitam falso-positivo.
/**
 * `\b` em JS so reconhece [A-Za-z0-9_], entao qualquer padrao que comece ou termine em
 * caractere acentuado nunca casa: `/\bé seguro\b/` jamais disparou em 173 artigos.
 * Aqui os limites usam lookaround Unicode com flag `u`.
 */
const FORBIDDEN_PHRASES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?<![\p{L}\p{N}])cobertura garantida(?![\p{L}\p{N}])/iu, reason: 'promessa de cobertura sem analise' },
  { pattern: /(?<![\p{L}\p{N}])indeniza[cç][ãa]o garantida(?![\p{L}\p{N}])/iu, reason: 'promessa de indenizacao' },
  { pattern: /(?<![\p{L}\p{N}])cobre tudo(?![\p{L}\p{N}])/iu, reason: 'absoluto sem ressalva' },
  { pattern: /(?<![\p{L}\p{N}])protege qualquer ve[ií]culo(?![\p{L}\p{N}])/iu, reason: 'absoluto sem ressalva' },
  { pattern: /(?<![\p{L}\p{N}])igual (a |ao |o |um )?seguro(?![\p{L}\p{N}])/iu, reason: 'confusao com seguro tradicional' },
  { pattern: /(?<![\p{L}\p{N}])tipo (um )?seguro(?![\p{L}\p{N}])/iu, reason: 'confusao com seguro tradicional' },
  // "e seguro" sem acento pegava "associacao e seguro" como falso positivo — so com acento.
  { pattern: /(?<![\p{L}\p{N}])é seguro(?![\p{L}\p{N}])/iu, reason: 'confusao com seguro tradicional' },
];

interface Input {
  article: ArticleRow;
}

interface Output {
  review_status: ReviewStatus;
  review_notes: string;
  hard_block_matches: Array<{ pattern: string; reason: string }>;
  llm_cost_usd: number | null;
}

const SYSTEM_PROMPT = `Voce e o revisor comercial e juridico da 21Go.

${SCOPE_RULES_TEXT}

Sua funcao: avaliar se um artigo do blog esta SEGURO para publicacao.

CRITERIOS:
1. NAO promete cobertura, indenizacao, aprovacao automatica.
2. NAO confunde protecao patrimonial veicular com seguro tradicional.
3. NAO inventa regras, valores ou prazos.
4. NAO menciona caminhao, carreta, onibus, transporte de carga.
5. NAO e repetitivo / "{tema} em {cidade}" sem dor especifica.
6. TEM CTA claro pra falar com consultor.
7. Tom: profissional, honesto, util — sem clickbait.

DECISAO POSSIVEL:
- APROVADO: pronto para publicar
- APROVADO_COM_AJUSTES: pode publicar mas sugere ajustes
- REPROVADO: nao publicar — explicar exatamente o que esta errado

Saida em JSON estrito (sem markdown, sem texto extra):
{
  "decision": "APROVADO" | "APROVADO_COM_AJUSTES" | "REPROVADO",
  "notes": "explicacao em 2-4 frases, citando trechos especificos quando aplicavel",
  "specific_fixes": ["array de ajustes pontuais (opcional)"]
}`;

export const agent06: Agent<Input, Output> = {
  id: '06-legal-reviewer',
  description: 'Revisa artigo gerado: hard-block regex + LLM judge',
  async run(input, ctx) {
    const a = input.article;
    if (!a.mdx_content) throw new Error('article sem mdx_content — nao tem o que revisar');
    const mdx = a.mdx_content;

    // ===== 1) Hard-block regex (frases proibidas + escopo) =====
    //
    // "e igual a seguro" tem um uso LEGITIMO e frequente: a pergunta do FAQ
    // ("A protecao veicular e igual a seguro de moto?"), que o artigo responde negando —
    // exatamente o esclarecimento que queremos fazer. Bloquear isso queimava a pauta de
    // um artigo correto. Quando o match esta numa pergunta ou vem seguido de negacao,
    // deixamos a decisao pro LLM judge, que le o contexto.
    const ehPerguntaOuNegacao = (texto: string, idx: number): boolean => {
      const trecho = texto.slice(Math.max(0, idx - 120), idx + 200);
      const linha = texto.slice(texto.lastIndexOf('\n', idx) + 1, texto.indexOf('\n', idx) === -1 ? undefined : texto.indexOf('\n', idx));
      if (/\?/.test(linha)) return true;                                  // pergunta (FAQ)
      if (/^#{1,6}\s/.test(linha.trim())) return true;                    // heading
      return /\b(n[ãa]o\s+[ée]|n[ãa]o\s+se\s+confunde|diferente\s+de|ao\s+contr[áa]rio)\b/i.test(trecho);
    };

    const hardMatches: Array<{ pattern: string; reason: string }> = [];
    for (const f of FORBIDDEN_PHRASES) {
      const re = new RegExp(f.pattern.source, f.pattern.flags.includes('g') ? f.pattern.flags : f.pattern.flags + 'g');
      let m: RegExpExecArray | null;
      let bloqueou = false;
      while ((m = re.exec(mdx)) !== null) {
        const contextual = /igual|tipo|[ée] seguro/i.test(f.pattern.source);
        if (contextual && ehPerguntaOuNegacao(mdx, m.index)) continue;   // FAQ/negacao: LLM decide
        bloqueou = true;
        break;
      }
      if (bloqueou) hardMatches.push({ pattern: f.pattern.source, reason: f.reason });
    }

    // Escopo
    const scope = checkScope(mdx);
    if (scope) hardMatches.push({ pattern: scope.matched, reason: scope.reason });

    // Gratuidade de adesao — a 21Go cobra taxa de ativacao desde sempre (25/08/2026)
    const falsePromise = checkFalsePromise(mdx);
    if (falsePromise) hardMatches.push({ pattern: falsePromise.matched, reason: falsePromise.reason });

    // ===== 2) Guards deterministicos de qualidade (decisao user 2026-05-20) =====
    // Separa body (sem frontmatter) pra contar so o conteudo
    const bodyOnly = mdx.replace(/^---[\s\S]+?---\n+/m, '');
    const wordCount = bodyOnly.split(/\s+/).filter(Boolean).length;

    // 2.1 — Tamanho: rejeita se fora da janela 1100-2200
    // (target 1300-1500 mas Gemini Flash consistentemente gera 1800-2000;
    //  rejeitar tudo gera loop infinito. Tolerancia ampla, qualidade fica
    //  com o LLM judge depois.)
    const HARD_MIN = 1100;
    const HARD_MAX = 2200;
    if (wordCount < HARD_MIN) {
      hardMatches.push({ pattern: `wordCount=${wordCount}<${HARD_MIN}`, reason: 'artigo curto demais (target 1300-1500)' });
    }
    if (wordCount > HARD_MAX) {
      hardMatches.push({ pattern: `wordCount=${wordCount}>${HARD_MAX}`, reason: 'artigo longo demais (target 1300-1500)' });
    }

    // 2.2 — 3+ CTAs: conta links pra /cotacao OU /protecao-veicular OU frase "fale com um consultor"
    const ctaLinks = (bodyOnly.match(/\]\((\/cotacao|\/protecao-veicular)\b/gi) ?? []).length;
    const ctaPhrases = (bodyOnly.match(/\b(fale com um consultor|faca uma cotacao|fa[çc]a uma cota[çc][ãa]o|conhe[çc]a os planos)\b/gi) ?? []).length;
    const totalCTAs = ctaLinks + Math.min(ctaPhrases, 2); // limita peso de frases pra nao dar match em qualquer menção
    if (totalCTAs < 3) {
      hardMatches.push({ pattern: `CTAs=${totalCTAs}`, reason: `artigo precisa de pelo menos 3 CTAs (achei ${totalCTAs})` });
    }

    // 2.3 — 3+ links internos (qualquer URL relativa do site)
    const internalLinks = Array.from(bodyOnly.matchAll(/\]\((\/[^)]+)\)/g)).map((m) => m[1]!);
    const hasProtecao = internalLinks.some((u) => u.startsWith('/protecao-veicular'));
    const hasCotacao = internalLinks.some((u) => u.startsWith('/cotacao'));
    const hasFaq = internalLinks.some((u) => u.startsWith('/faq'));
    if (internalLinks.length < 3) {
      hardMatches.push({ pattern: `internalLinks=${internalLinks.length}`, reason: `precisa de 3+ links internos (achei ${internalLinks.length})` });
    }
    if (!hasProtecao) {
      hardMatches.push({ pattern: 'missing-link-/protecao-veicular', reason: 'link obrigatorio pra /protecao-veicular ausente' });
    }
    if (!hasCotacao) {
      hardMatches.push({ pattern: 'missing-link-/cotacao', reason: 'link obrigatorio pra /cotacao ausente' });
    }
    // /faq e obrigatorio mas as vezes pode ficar fora (warn, nao block)
    if (!hasFaq) {
      log.warn({ articleId: a.id }, 'aviso: link pra /faq ausente (recomendado)');
    }

    // 2.3.1 — Numero de beneficio de plano sem dizer o plano.
    // Reboque, carro reserva e taxi MUDAM por plano (reboque vai de 200km no Basico a
    // 1.200km no Premium). Um artigo afirmando "a 21Go cobre 400km de guincho" — numero
    // real, mas do plano Jeito — engana quem tem o Basico e vira reclamacao.
    // Exige que a frase qualifique o plano ou remeta a comparacao.
    const PLANO_MENCIONADO = /\b(b[aá]sico|jeito|vip|premium|conforme o plano|varia (conforme|por|de acordo com) o plano|depende do plano|cada plano)\b/i;
    // So vale quando o numero fala de um SERVICO NOSSO, nomeado. Verbos genericos
    // ("cobre", "inclui", "oferece") estavam no gatilho e geravam falso positivo em
    // frase sobre a garantia de FABRICA do carro — "a garantia cobre motor e bateria
    // por 8 anos ou 150.000 km" nao e beneficio de plano da 21Go, e barrar isso
    // queimava pauta boa do cluster BYD. Tambem nao pode pegar "autonomia de 400km".
    const SERVICO_NOSSO = /\b(reboque|guincho|carro reserva|ve[ií]culo reserva|t[aá]xi|assist[eê]ncia 24)\b/i;
    const frasesComBeneficio = bodyOnly
      .split(/(?<=[.!?])\s+|\n/)
      .filter((f) => SERVICO_NOSSO.test(f))
      .filter((f) => /\b\d{2,4}\s*km\b/i.test(f) || /\b\d{1,2}\s*dias?\b/i.test(f));
    const frasesSemPlano = frasesComBeneficio.filter((f) => !PLANO_MENCIONADO.test(f));
    if (frasesSemPlano.length > 0) {
      hardMatches.push({
        pattern: `beneficio-sem-plano: "${frasesSemPlano[0]!.trim().slice(0, 90)}"`,
        reason: 'cita numero de beneficio (reboque/carro reserva) sem dizer a qual plano pertence',
      });
    }

    // ===== 2.3.2 — Sinais de GEO (ser citado por IA), medidos em 08/08 =====
    // Auditoria dos 20 ultimos publicados: TL;DR, "Em resumo", FAQ e fontes apareciam em
    // 18-20/20, mas TABELA em 1/20 e apenas 47% dos H2 eram perguntas. Sao justamente os
    // dois sinais que decidem citacao: LLM extrai tabela inteira, e H2-pergunta e o que
    // casa com a query. O prompt ja pedia os dois — pedir nao bastou, entao vira guard.
    // Hard-block validado em 08/08: com o bloco [TAB] no prompt, o primeiro artigo ja
    // saiu com tabela de 4x4 na 1a tentativa. Agora a trava impede a regressao.
    const temTabela = /\n\|.*\|.*\n\|[\s:-]*\|/.test(bodyOnly);
    if (!temTabela) {
      hardMatches.push({
        pattern: 'sem-tabela',
        reason: 'artigo precisa de 1 tabela markdown comparativa (formato que IA cita mais)',
      });
    }

    const H2_FIXOS = /^##\s*(em resumo|perguntas frequentes|fontes consultadas)/i;
    const h2s = (bodyOnly.match(/^##\s+.+$/gm) ?? []).filter((h) => !H2_FIXOS.test(h.trim()));
    const h2Perguntas = h2s.filter((h) => h.trim().endsWith('?'));
    // 60%, nao 100%: o alvo editorial e todo H2 ser pergunta, mas reprovar por um
    // subtitulo declarativo custaria a pauta inteira. O piso corta o padrao antigo
    // (47%) sem virar tirania.
    if (h2s.length >= 3 && h2Perguntas.length / h2s.length < 0.6) {
      hardMatches.push({
        pattern: `h2-perguntas=${h2Perguntas.length}/${h2s.length}`,
        reason: 'a maioria dos H2 precisa ser pergunta real terminada em "?" (padrao Atomic Answer)',
      });
    }

    // H2 repetido dentro do mesmo artigo. O primeiro lote com o prompt novo trouxe
    // "Como funciona a protecao veicular para carro financiado?" e "Como funciona a
    // protecao veicular para carros financiados?" no MESMO texto — duas secoes
    // respondendo a mesma pergunta diluem o artigo e confundem quem extrai trecho.
    const normalizaH2 = (h: string) => h.replace(/^##\s+/, '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/s\b/g, '').replace(/\s+/g, ' ').trim();
    const vistos = new Map<string, string>();
    for (const h of h2s) {
      const chave = normalizaH2(h);
      const anterior = vistos.get(chave);
      if (anterior) {
        hardMatches.push({
          pattern: `h2-duplicado: "${h.trim().slice(0, 60)}"`,
          reason: 'dois H2 fazem a mesma pergunta — unifique as secoes',
        });
        break;
      }
      vistos.set(chave, h);
    }

    // 2.4 — Keywords frontmatter NAO duplica o title
    const fmMatch = /^---\n([\s\S]+?)\n---/.exec(mdx);
    if (fmMatch) {
      const fm = fmMatch[1] ?? '';
      const titleMatch = /title:\s*['"]?(.+?)['"]?\s*$/m.exec(fm);
      const kwSection = /keywords:\s*([\s\S]+?)(?:\n[a-z]+:|$)/i.exec(fm);
      if (titleMatch && kwSection) {
        const title = titleMatch[1]!.trim().toLowerCase();
        const kwYaml = kwSection[1]!.toLowerCase();
        // Se as keywords contêm o título inteiro como item, fail
        if (kwYaml.includes(title.replace(/['"]/g, ''))) {
          hardMatches.push({
            pattern: 'keywords-equals-title',
            reason: 'campo keywords do frontmatter nao pode duplicar o title — use termos curtos separados',
          });
        }
      }
    }

    if (hardMatches.length > 0) {
      const notes = 'REPROVADO no hard-block + guards: ' + hardMatches.map((m) => `${m.reason} (${m.pattern})`).join('; ');
      log.warn({ articleId: a.id, matches: hardMatches, wordCount, totalCTAs, internalLinks: internalLinks.length }, 'hard-block disparou');
      if (!ctx.dry_run) {
        await updateArticle(a.id, { review_status: 'REPROVADO', review_notes: notes, status: 'in_review' });
      }
      return { output: { review_status: 'REPROVADO', review_notes: notes, hard_block_matches: hardMatches, llm_cost_usd: null } };
    }

    // ===== 2) LLM judge =====
    const userMsg = `Titulo: ${a.title}
Categoria: ${a.category ?? '?'}
URL futura: ${a.url}

Conteudo do artigo (Markdown):
"""
${mdx.slice(0, 12000)}
"""

Avalie e retorne JSON conforme as instrucoes do sistema.`;

    interface LlmReview {
      decision: ReviewStatus;
      notes: string;
      specific_fixes?: string[];
    }

    // 1 retry com temperature 0: o Gemini Flash devolve JSON truncado de vez em quando
    // e, sem retry, a excecao subia e derrubava o artigo INTEIRO no worker — texto
    // pronto e aprovavel perdido por uma resposta malformada do juiz.
    let review: LlmReview | null = null;
    let r: Awaited<ReturnType<typeof complete>> | null = null;
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      r = await complete({
        tier: 'main',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
        max_tokens: 1500,
        temperature: tentativa === 1 ? 0.2 : 0,
        timeout_ms: 120_000,
      });
      try {
        const cleaned = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        review = JSON.parse(cleaned) as LlmReview;
        break;
      } catch (e) {
        if (tentativa === 1) {
          log.warn({ err: (e as Error).message, text: r.text.slice(0, 120) }, 'judge devolveu JSON invalido — repetindo com temperature 0');
          continue;
        }
        log.error({ err: (e as Error).message, text: r.text.slice(0, 200) }, 'LLM retornou JSON invalido nas 2 tentativas');
        throw new Error(`LegalReviewer JSON invalido: ${(e as Error).message}`);
      }
    }
    if (!review || !r) throw new Error('LegalReviewer nao produziu decisao');
    if (!['APROVADO', 'APROVADO_COM_AJUSTES', 'REPROVADO'].includes(review.decision)) {
      throw new Error(`LegalReviewer decision invalida: ${review.decision}`);
    }

    const fullNotes = review.notes + (review.specific_fixes?.length ? '\nAjustes:\n- ' + review.specific_fixes.join('\n- ') : '');

    log.info({ articleId: a.id, decision: review.decision, cost: r.cost_usd }, 'review LLM ok');
    if (!ctx.dry_run) {
      await updateArticle(a.id, { review_status: review.decision, review_notes: fullNotes, status: 'in_review' });
    }

    return {
      output: {
        review_status: review.decision,
        review_notes: fullNotes,
        hard_block_matches: [],
        llm_cost_usd: r.cost_usd,
      },
    };
  },
};

