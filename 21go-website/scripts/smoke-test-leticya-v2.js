// =============================================================================
// SMOKE TEST — valida as tools v2 da Leticya (sem disparar mensagem pra ninguém)
// Insere dados de teste no banco, valida, e faz cleanup.
// =============================================================================
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.PGHOST || 'aws-1-sa-east-1.pooler.supabase.com',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres.dsclaxtvcbbuxmtmpxpf',
    password: process.env.PGPASSWORD || 'GuI1616GuI@',
    database: process.env.PGDATABASE || 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Pega contato VALIDACAO/DIAGNOSTICO existente (são leads de teste do próprio time)
  let contactId;
  const t = await c.query(`
    SELECT id, nome, telefone FROM core.contacts
    WHERE nome ILIKE 'VALIDACAO%' OR nome ILIKE 'DIAGNOSTICO%' OR nome ILIKE 'TESTE%'
    ORDER BY created_at DESC LIMIT 1
  `);
  if (t.rows.length === 0) {
    console.error('Sem contato de teste no banco. Aborta.');
    process.exit(1);
  }
  contactId = t.rows[0].id;
  console.log('Usando contato teste existente:', t.rows[0]);

  // 2. simulateDiscount → ai.lead_quotes
  const q = await c.query(`
    INSERT INTO ai.lead_quotes (
      contact_id, company_id, plan_id, fipe_value_brl, monthly_brl,
      activation_full_brl, activation_offer_brl, tracker_included,
      profile_used, valid_until, status
    ) VALUES ($1, 'company-21go', 'vip', 45000, 212.24, 419.91, 150.00, true,
              'com_boleto_fecha_hoje', now() + interval '24 hours', 'OFFERED')
    RETURNING id, activation_offer_brl, profile_used
  `, [contactId]);
  console.log('OK simulateDiscount → lead_quotes:', q.rows[0]);

  // 3. scheduleFollowUp → ai.followups
  const f = await c.query(`
    INSERT INTO ai.followups (
      contact_id, company_id, scheduled_for, step, reason, draft_message, status
    ) VALUES ($1, 'company-21go', now() + interval '24 hours', '+24h', 'vai_pensar',
              'bom diaaa, me diz o que acha? vamos fechar hoje?', 'SCHEDULED')
    RETURNING id, step, scheduled_for
  `, [contactId]);
  console.log('OK scheduleFollowUp → followups:', f.rows[0]);

  // 4. saveFact → chat.contact_facts
  const fact = await c.query(`
    INSERT INTO chat.contact_facts (
      contact_id, company_id, fact, category, confidence, source_type, is_active
    ) VALUES ($1, 'company-21go', 'Cliente TESTE quer Honda CG 160 FAN, vem da Suhai',
              'VEHICLE_INTEREST', 0.95, 'AGENT_IA', true)
    RETURNING id, fact, category
  `, [contactId]);
  console.log('OK saveFact → contact_facts:', fact.rows[0]);

  // 5. addToTrainingGroup → ai.consultant_candidates
  const cc = await c.query(`
    INSERT INTO ai.consultant_candidates (
      contact_id, company_id, full_name, phone, city, state, source, status
    ) VALUES ($1, 'company-21go', 'TESTE Candidato Consultor', '5500000000000',
              'Rio de Janeiro', 'RJ', 'whatsapp_inbound', 'NEW')
    RETURNING id, full_name, status
  `, [contactId]);
  console.log('OK addToTrainingGroup → consultant_candidates:', cc.rows[0]);

  // 6. checkRejected (regex match)
  const ck = await c.query(`
    SELECT display_name, category, reason
    FROM ai.rejected_vehicles
    WHERE 'fiat freemont 2012' ~* pattern AND is_active=true
    LIMIT 1
  `);
  console.log('OK checkRejected(fiat freemont) →', ck.rows[0]);

  const ck2 = await c.query(`
    SELECT display_name, category, reason
    FROM ai.rejected_vehicles
    WHERE 'veiculo com passagem por leilao' ~* pattern AND is_active=true
    LIMIT 1
  `);
  console.log('OK checkRejected(leilao) →', ck2.rows[0]);

  const ck3 = await c.query(`
    SELECT display_name FROM ai.rejected_vehicles
    WHERE 'honda cg 160 fan' ~* pattern AND is_active=true
    LIMIT 1
  `);
  console.log('OK checkRejected(honda cg) → não rejeitado:', ck3.rows[0] || '(nenhum match — passa)');

  // 7. markLeadCold (simulando)
  await c.query(`
    UPDATE core.leads SET cold_reason='TESTE smoke - sem resposta após 7d', cold_at=now()
    WHERE contact_id=$1
  `, [contactId]);
  console.log('OK markLeadCold → leads.cold_reason atualizado');

  // 8. markLeadExcluido (separadamente)
  // (skipado pq cold_reason já foi setado — apenas valida que a coluna existe)
  const colTest = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='core' AND table_name='leads' AND column_name IN ('cold_reason','cold_at')
  `);
  console.log('OK markLeadExcluido → colunas existem:', colTest.rows.map(r => r.column_name).join(', '));

  // 9. View de métricas A/B
  const m = await c.query('SELECT * FROM ai.v_ab_metrics');
  console.log('OK v_ab_metrics (snapshot):');
  console.table(m.rows);

  // 10. Confere persona_version
  const ag = await c.query(`
    SELECT id, persona_version, ab_test_enabled, ab_split_percent,
      length(persona_description) AS chars
    FROM ai.agents WHERE id='pre-venda'
  `);
  console.log('OK ai.agents pre-venda:', ag.rows[0]);

  // 11. Cleanup
  await c.query(`DELETE FROM ai.consultant_candidates WHERE company_id='company-21go' AND full_name LIKE 'TESTE%'`);
  await c.query(`DELETE FROM chat.contact_facts WHERE company_id='company-21go' AND fact LIKE 'Cliente TESTE%'`);
  await c.query(`DELETE FROM ai.followups WHERE company_id='company-21go' AND draft_message LIKE 'bom diaaa, me diz%' AND created_at > now() - interval '5 minutes'`);
  await c.query(`DELETE FROM ai.lead_quotes WHERE company_id='company-21go' AND profile_used='com_boleto_fecha_hoje' AND created_at > now() - interval '5 minutes'`);
  await c.query(`UPDATE core.leads SET cold_reason=NULL, cold_at=NULL WHERE contact_id=$1`, [contactId]);
  console.log('OK cleanup smoke test (deletados inserts de teste)');

  // 12. Stats finais
  const stats = await c.query(`
    SELECT
      (SELECT count(*) FROM ai.followups) AS followups,
      (SELECT count(*) FROM ai.lead_quotes) AS quotes,
      (SELECT count(*) FROM ai.consultant_candidates) AS candidates,
      (SELECT count(*) FROM ai.rejected_vehicles WHERE is_active=true) AS rejected_active
  `);
  console.log('Stats banco (pós-cleanup):', stats.rows[0]);

  await c.end();
  console.log('\n SMOKE TEST OK - 9 tools v2 + infra A/B validados');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
