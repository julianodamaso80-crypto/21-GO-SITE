/**
 * Agente 08 — Design & Repurpose
 *
 * Gera sugestoes de reaproveitamento. NAO cria imagens automaticamente.
 * Saida e textual, salva em seo.articles (a evolucao futura cria um campo proprio).
 *
 * Usa Haiku (tier='light') — tarefa criativa simples, custo baixo.
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { child } from '../lib/logger.js';

const log = child('agent:08-design-repurpose');

interface Input {
  article: ArticleRow;
}

interface Output {
  featured_image_brief: string;
  instagram_post: string;
  reels_script_30s: string;
  whatsapp_message: string;
  ads_creative_idea: string;
  llm_cost_usd: number | null;
}

const SYSTEM_PROMPT = `Voce e o gerente de conteudo da 21Go. Sua funcao: a partir de um artigo do blog, gerar instrucoes/copy pra reaproveitar em:
1. Imagem destacada do post (descricao textual — NAO prompt de IA generativa)
2. Post de Instagram (carrossel/feed — 1 paragrafo de copy + CTA)
3. Roteiro de Reels de 30s (linhas separadas por timestamp)
4. Mensagem de WhatsApp (texto curto, link pro artigo, CTA pra cotacao)
5. Ideia de criativo pra trafego pago (Meta Ads / Google Ads)

REGRAS DA MARCA:
- Nunca cortar o logo 21Go
- Nunca deformar o logo
- Visual moderno, limpo, profissional — sem poluicao
- Cores: azul institucional, laranja 21Go (CTAs)
- Tipografia: Inter

LIMITES DE CONTEUDO:
- Sem prometer cobertura/indenizacao/aprovacao
- Sem mencionar caminhao/onibus/carga
- Tom: util e honesto, nao clickbait

SAIDA: JSON estrito (sem markdown):
{
  "featured_image_brief": "descricao textual da imagem 1200x675 (sem prompt IA)",
  "instagram_post": "1 paragrafo + CTA",
  "reels_script_30s": "linhas com [00s], [05s], [15s] etc",
  "whatsapp_message": "texto curto com link {URL} marcador",
  "ads_creative_idea": "headline + descricao curta + ideia de visual"
}`;

export const agent08: Agent<Input, Output> = {
  id: '08-design-repurpose',
  description: 'Gera sugestoes de reaproveitamento (imagem, IG, Reels, WhatsApp, Ads)',
  async run(input) {
    const a = input.article;

    const r = await complete({
      tier: 'light',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Titulo: ${a.title}
URL: ${a.url}
Categoria: ${a.category}
Palavra-chave principal: ${a.main_keyword ?? '(nao informada)'}
Descricao do post: ${a.meta_description ?? '(usar titulo)'}

Gere o reaproveitamento conforme as instrucoes do sistema.`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    });

    let parsed: Output;
    try {
      const cleaned = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      const json = JSON.parse(cleaned) as Partial<Output>;
      parsed = {
        featured_image_brief: json.featured_image_brief ?? '',
        instagram_post: json.instagram_post ?? '',
        reels_script_30s: json.reels_script_30s ?? '',
        whatsapp_message: json.whatsapp_message ?? '',
        ads_creative_idea: json.ads_creative_idea ?? '',
        llm_cost_usd: r.cost_usd,
      };
    } catch (e) {
      log.error({ err: (e as Error).message }, 'JSON invalido — retornando vazio');
      parsed = {
        featured_image_brief: '',
        instagram_post: '',
        reels_script_30s: '',
        whatsapp_message: '',
        ads_creative_idea: '',
        llm_cost_usd: r.cost_usd,
      };
    }

    log.info({ articleId: a.id, cost: r.cost_usd }, 'repurpose gerado');
    return { output: parsed };
  },
};
