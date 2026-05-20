/**
 * Agente 15 — Reporting
 *
 * Snapshot diario:
 *   - GSC: impressions/clicks/ctr/avg_position por URL (ultimos 7 dias)
 *   - GA4: sessions/engagedSessions/avg_engagement_time/conversions por pagePath
 *   - GA4 event: whatsapp_click — contagem por pagePath
 *
 * Salva linhas em seo.metrics_daily (upsert por chave composta).
 *
 * NUNCA inventa. Se a credencial nao existe, retorna { ok: false, reason: 'pendente' }.
 */
import type { Agent } from './_types.js';
import * as gsc from '../integrations/gsc.js';
import * as ga4 from '../integrations/ga4.js';
import { supabase } from '../db/supabase.js';
import { upsertMetrics } from '../db/repositories/indexing.js';
import type { MetricsDailyInsert } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:15-reporting');

interface Input {
  days?: number; // default 7
}

interface Output {
  rows_inserted: { gsc: number; ga4: number; events: number };
  errors: string[];
}

export const agent15: Agent<Input, Output> = {
  id: '15-reporting',
  description: 'Snapshot diario GSC + GA4 -> seo.metrics_daily',
  async run(input, ctx) {
    const days = input.days ?? 7;
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const credsGoogle = !!config.GOOGLE_REFRESH_TOKEN;
    const errors: string[] = [];
    const rows: MetricsDailyInsert[] = [];

    // Mapeia URL -> article_id
    const sb = supabase();
    const urlToArticle = new Map<string, string>();
    const { data: articles } = await sb.from('articles').select('id, url').eq('status', 'published');
    for (const a of (articles ?? []) as Array<{ id: string; url: string }>) urlToArticle.set(a.url, a.id);

    // ===== GSC =====
    let gscCount = 0;
    if (credsGoogle) {
      try {
        const rowsGsc = await gsc.searchAnalytics({
          startDate: fmt(start), endDate: fmt(end), dimensions: ['page'], rowLimit: 1000,
        });
        // O GSC retorna agregado no periodo, nao por dia. Pra ter snapshot diario,
        // marcamos a data como "hoje" e a janela e (start..end). Solucao simples: 1 linha por url
        // representando a JANELA agregada do dia da execucao.
        const today = fmt(end);
        for (const r of rowsGsc) {
          if (!r.url.includes('/blog/')) continue;
          rows.push({
            article_id: urlToArticle.get(r.url),
            url: r.url,
            date: today,
            source: 'gsc',
            impressions: r.impressions,
            clicks: r.clicks,
            ctr: r.ctr,
            avg_position: r.position,
          });
          gscCount++;
        }
      } catch (e) {
        errors.push(`gsc: ${(e as Error).message}`);
      }
    } else {
      log.warn('Pendente Google — GSC pulado');
    }

    // ===== GA4 =====
    let ga4Count = 0;
    let eventsCount = 0;
    if (credsGoogle && config.GA4_PROPERTY_ID) {
      try {
        const ga4Rows = await ga4.pageMetrics({ startDate: fmt(start), endDate: fmt(end) });
        for (const r of ga4Rows) {
          if (!r.pagePath.includes('/blog/')) continue;
          const url = `https://21go.site${r.pagePath}`;
          // r.date e YYYYMMDD
          const isoDate = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
          rows.push({
            article_id: urlToArticle.get(url),
            url,
            date: isoDate,
            source: 'ga4',
            ga4_sessions: r.sessions,
            ga4_engaged_sessions: r.engagedSessions,
            ga4_engagement_rate: r.engagementRate,
            ga4_avg_engagement_time_sec: r.averageEngagementTime,
            ga4_conversions: r.conversions,
          });
          ga4Count++;
        }
      } catch (e) {
        errors.push(`ga4: ${(e as Error).message}`);
      }

      // Evento custom whatsapp_click
      try {
        const events = await ga4.eventCountByPage({
          startDate: fmt(start), endDate: fmt(end), eventName: 'whatsapp_click',
        });
        for (const r of events) {
          if (!r.pagePath.includes('/blog/')) continue;
          const url = `https://21go.site${r.pagePath}`;
          const isoDate = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
          // Junta no mesmo row se ja existir (mesma chave composta)
          const existing = rows.find((x) => x.url === url && x.date === isoDate && x.source === 'ga4');
          if (existing) {
            existing.whatsapp_clicks = r.events;
          } else {
            rows.push({
              article_id: urlToArticle.get(url), url, date: isoDate, source: 'ga4', whatsapp_clicks: r.events,
            });
          }
          eventsCount++;
        }
      } catch (e) {
        errors.push(`ga4 events: ${(e as Error).message}`);
      }
    } else {
      log.warn('Pendente Google ou GA4_PROPERTY_ID — GA4 pulado');
    }

    // Persiste
    if (!ctx.dry_run && rows.length > 0) {
      try {
        await upsertMetrics(rows);
      } catch (e) {
        errors.push(`upsertMetrics: ${(e as Error).message}`);
      }
    }

    log.info({ gscCount, ga4Count, eventsCount, errs: errors.length }, 'reporting concluido');
    return { output: { rows_inserted: { gsc: gscCount, ga4: ga4Count, events: eventsCount }, errors } };
  },
};
