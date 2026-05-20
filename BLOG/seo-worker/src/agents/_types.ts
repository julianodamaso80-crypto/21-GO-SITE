/**
 * Tipos compartilhados dos 15 agentes.
 * Cada agente exporta { id, description, run } — o orquestrador chama via withRun.
 */

export type AgentId =
  | '01-keyword-research'
  | '02-seo-strategist'
  | '03-anti-repetition'
  | '04-briefing'
  | '05-writer'
  | '06-legal-reviewer'
  | '07-onpage-seo'
  | '08-design-repurpose'
  | '09-publisher'
  | '10-sitemap'
  | '11-google-indexing'
  | '12-bing-indexnow'
  | '13-gsc-analyst'
  | '14-content-updater'
  | '15-reporting';

export interface AgentContext {
  triggered_by: string;       // 'cron:weekly' | 'manual' | 'agent:09'
  dry_run?: boolean;
}

export interface AgentResult<O> {
  output: O;
  /** Custo/tokens LLM se aplicavel — gravado em seo.agent_runs */
  llm?: {
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number | null;
  };
}

export interface Agent<I, O> {
  id: AgentId;
  description: string;
  run(input: I, ctx: AgentContext): Promise<AgentResult<O>>;
}
