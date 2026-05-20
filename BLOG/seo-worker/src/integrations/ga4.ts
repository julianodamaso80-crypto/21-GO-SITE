/**
 * GA4 Data API — usado pelo Agente 15 (Reporting).
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 * Scope: https://www.googleapis.com/auth/analytics.readonly
 */
import { getAccessToken } from './google-auth.js';
import { config } from '../config.js';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export interface Ga4PageMetricsRow {
  pagePath: string;
  date: string; // YYYYMMDD
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageEngagementTime: number;
  conversions: number;
}

/** Relatorio: paginas por dia (ultimos N dias). */
export async function pageMetrics(opts: { startDate: string; endDate: string }): Promise<Ga4PageMetricsRow[]> {
  if (!config.GA4_PROPERTY_ID) throw new Error('Pendente de credencial: GA4_PROPERTY_ID');
  const token = await getAccessToken(SCOPE);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${config.GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'date' }],
        metrics: [
          { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'engagementRate' },
          { name: 'averageSessionDuration' }, { name: 'conversions' },
        ],
        limit: 10000,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ga4 runReport falhou: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  type Resp = { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }> };
  const json = (await res.json()) as Resp;
  return (json.rows ?? []).map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value ?? '',
    date: r.dimensionValues?.[1]?.value ?? '',
    sessions: parseInt(r.metricValues?.[0]?.value ?? '0', 10),
    engagedSessions: parseInt(r.metricValues?.[1]?.value ?? '0', 10),
    engagementRate: parseFloat(r.metricValues?.[2]?.value ?? '0'),
    averageEngagementTime: parseFloat(r.metricValues?.[3]?.value ?? '0'),
    conversions: parseInt(r.metricValues?.[4]?.value ?? '0', 10),
  }));
}

/** Quantidade de eventos custom (ex: whatsapp_click) por pagina. */
export async function eventCountByPage(opts: { startDate: string; endDate: string; eventName: string }): Promise<Array<{ pagePath: string; date: string; events: number }>> {
  if (!config.GA4_PROPERTY_ID) throw new Error('Pendente de credencial: GA4_PROPERTY_ID');
  const token = await getAccessToken(SCOPE);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${config.GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'date' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: opts.eventName } } },
        limit: 10000,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ga4 eventCount falhou: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  type Resp = { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }> };
  const json = (await res.json()) as Resp;
  return (json.rows ?? []).map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value ?? '',
    date: r.dimensionValues?.[1]?.value ?? '',
    events: parseInt(r.metricValues?.[0]?.value ?? '0', 10),
  }));
}
