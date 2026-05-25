// Truncate tudo no banco novo + re-aplica seeds (migration 180)
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({
  host: 'aws-1-sa-east-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.dsclaxtvcbbuxmtmpxpf',
  password: 'GuI1616GuI@',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
});

(async () => {
  await c.connect();
  console.log('Truncating todas as tabelas...');
  await c.query(`
    TRUNCATE
      core.contacts, core.vehicles, core.leads, core.contact_temperature,
      chat.conversations, chat.messages, chat.message_embeddings, chat.contact_facts,
      ai.agent_runs, ai.agent_actions, ai.escalations,
      ai.message_variations, ai.knowledge_chunks, ai.agents,
      tracking.lead_status_history, tracking.utm_attribution, tracking.conversion_events_log,
      ops.webhook_inbound_log, ops.outbound_event_log, ops.audit_logs, ops.plate_lookups, ops.whatsapp_instances,
      crm.refresh_tokens, crm.cards, crm.tasks, crm.sinistros, crm.vistorias, crm.boletos, crm.nps_surveys, crm.indicacoes, crm.ouvidoria, crm.projetos, crm.automacoes, crm.card_field_values, crm.field_definitions,
      crm.phases, crm.pipes, crm.oficinas, crm.users
    RESTART IDENTITY CASCADE;
  `);
  console.log('OK truncated.');

  console.log('Re-aplicando seed (180)...');
  const seed = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '180_super_banco_seeds.sql'), 'utf8');
  await c.query(seed);
  console.log('OK seed re-aplicado.');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
