// =============================================================================
// etl-super-banco.js
// Migra dados do banco antigo (noawceqgqfwtpnrzmvdo) pro super-banco novo
// (dsclaxtvcbbuxmtmpxpf), com dedup de contacts e mapping de IDs antigo->novo.
//
// Estagios:
//  1. Entidades simples (companies, users, pipes, phases, oficinas, whatsapp_instances)
//  2. Pessoas com dedup (associados + leads -> contacts; leads; vehicles; utm)
//  3. Conversas linkadas (conversations + messages)
//  4. CRM ops (cards, sinistros, nps, boletos, projetos)
//  5. Reconciliacao (count antigo vs novo)
// =============================================================================
const { Client } = require('pg');

const PASS = 'GuI1616GuI@';
const OLD_REF = 'noawceqgqfwtpnrzmvdo';
const NEW_REF = 'dsclaxtvcbbuxmtmpxpf';
const HOST = 'aws-1-sa-east-1.pooler.supabase.com';
const DEFAULT_COMPANY = 'company-21go';

function newClient(ref) {
  return new Client({
    host: HOST, port: 5432,
    user: 'postgres.' + ref,
    password: PASS,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });
}

const log = (...a) => console.log(new Date().toISOString().substring(11, 19), ...a);
const cents = (v) => v == null ? null : Math.round(Number(v) * 100);
function toJsonb(v) {
  if (v == null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // Se ja parece JSON, valida; senao embrulha
    if (s.startsWith('{') || s.startsWith('[')) {
      try { JSON.parse(s); return s; } catch { /* fall through */ }
    }
    return JSON.stringify({ raw: s });
  }
  return JSON.stringify({ raw: String(v) });
}

async function main() {
  const oldC = newClient(OLD_REF);
  const newC = newClient(NEW_REF);
  await oldC.connect();
  await newC.connect();
  log('Conectado nos dois bancos');

  // Mapping de IDs antigo -> novo
  const associadoMap = new Map();      // old associados.id -> new contacts.id (uuid)
  const leadMap = new Map();           // old leads.id -> { newLeadId, contactId }
  const conversationMap = new Map();   // old conversations.id -> new conversations.id
  const oficinaMap = new Map();

  // ─── Desabilitar triggers pesadas (mantemos normalize_phone ativo) ───
  log('Desabilitando triggers pesadas...');
  await newC.query(`
    ALTER TABLE chat.messages DISABLE TRIGGER trg_msg_update_conversation;
    ALTER TABLE chat.messages DISABLE TRIGGER trg_temp_on_message;
    ALTER TABLE core.leads DISABLE TRIGGER trg_temp_on_lead;
    ALTER TABLE core.leads DISABLE TRIGGER trg_log_lead_status;
    ALTER TABLE core.contacts DISABLE TRIGGER trg_temp_on_associado;
  `);

  // ═══════════════════════ ESTAGIO 1: ENTIDADES SIMPLES ═══════════════════════
  log('=== Estagio 1: entidades simples ===');

  // 1.1 USERS
  const oldUsers = (await oldC.query('SELECT * FROM users ORDER BY created_at')).rows;
  log(`  users: ${oldUsers.length}`);
  for (const u of oldUsers) {
    await newC.query(`
      INSERT INTO crm.users (id, company_id, email, password_hash, first_name, last_name, avatar_url, phone, role, is_active, last_login_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO NOTHING
    `, [u.id, u.company_id || DEFAULT_COMPANY, u.email, u.password, u.first_name, u.last_name, u.avatar, u.phone, u.role, u.is_active !== false, u.last_login_at, u.created_at, u.updated_at]);
  }

  // 1.2 PIPES
  const oldPipes = (await oldC.query('SELECT * FROM pipes')).rows;
  log(`  pipes: ${oldPipes.length}`);
  for (const p of oldPipes) {
    await newC.query(`
      INSERT INTO crm.pipes (id, company_id, name, description, icon, color, status, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
    `, [p.id, p.company_id || DEFAULT_COMPANY, p.name, p.description, p.icon, p.color || '#1B4DA1', p.status || 'ACTIVE', p.tags, p.created_at, p.updated_at]);
  }

  // 1.3 PHASES
  const oldPhases = (await oldC.query('SELECT * FROM phases ORDER BY position')).rows;
  log(`  phases: ${oldPhases.length}`);
  for (const ph of oldPhases) {
    await newC.query(`
      INSERT INTO crm.phases (id, company_id, pipe_id, name, color, position, probability, is_won, is_lost, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
    `, [ph.id, ph.company_id || DEFAULT_COMPANY, ph.pipe_id, ph.name, ph.color || '#888', ph.position || 0, ph.probability || 0, ph.is_won || false, ph.is_lost || false, ph.created_at, ph.updated_at]);
  }

  // 1.4 OFICINAS
  const oldOficinas = (await oldC.query('SELECT * FROM oficinas')).rows;
  log(`  oficinas: ${oldOficinas.length}`);
  for (const o of oldOficinas) {
    const r = await newC.query(`
      INSERT INTO crm.oficinas (company_id, nome, cnpj, telefone, email, endereco, especialidades, is_credenciada, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [o.company_id || DEFAULT_COMPANY, o.nome || o.name || 'Sem nome', o.cnpj, o.telefone || o.phone, o.email, toJsonb(o.endereco), o.especialidades, o.is_credenciada !== false, o.created_at || new Date(), o.updated_at || new Date()]);
    oficinaMap.set(o.id, r.rows[0].id);
  }

  // 1.5 WHATSAPP_INSTANCES
  const oldWa = (await oldC.query('SELECT * FROM whatsapp_instances')).rows;
  log(`  whatsapp_instances: ${oldWa.length}`);
  for (const w of oldWa) {
    await newC.query(`
      INSERT INTO ops.whatsapp_instances (id, company_id, channel, display_name, phone_number, evolution_api_url, evolution_api_key, status, is_default, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
    `, [w.id, w.company_id || DEFAULT_COMPANY, 'WHATSAPP_EVOLUTION', w.name || w.display_name || w.id, w.phone || w.phone_number || '', w.api_url || w.evolution_api_url, w.api_key || w.evolution_api_key, (w.status || 'ACTIVE').toUpperCase(), w.is_default !== false, w.created_at || new Date(), w.updated_at || new Date()]);
  }

  // ═══════════════════════ ESTAGIO 2: PESSOAS ═══════════════════════
  log('=== Estagio 2: pessoas (dedup) ===');

  // 2.1 ASSOCIADOS -> contacts (is_associado=true)
  const oldAssoc = (await oldC.query('SELECT * FROM associados ORDER BY created_at')).rows;
  log(`  associados: ${oldAssoc.length}`);
  for (const a of oldAssoc) {
    const tel = a.telefone || a.whatsapp;
    if (!tel && !a.email) {
      log(`    associado skip (sem tel/email): ${a.id}`);
      continue;
    }
    const r = await newC.query(`
      INSERT INTO core.contacts (
        company_id, nome, cpf, email, telefone, whatsapp, cidade, estado, cep,
        is_associado, associado_desde, hinova_id,
        primeiro_contato_origem, primeiro_contato_em, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        true, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (company_id, telefone) DO UPDATE SET
        is_associado = true,
        associado_desde = COALESCE(core.contacts.associado_desde, EXCLUDED.associado_desde),
        hinova_id = COALESCE(core.contacts.hinova_id, EXCLUDED.hinova_id),
        nome = COALESCE(NULLIF(core.contacts.nome, ''), EXCLUDED.nome),
        email = COALESCE(core.contacts.email, EXCLUDED.email),
        cpf = COALESCE(core.contacts.cpf, EXCLUDED.cpf)
      RETURNING id
    `, [
      a.company_id || DEFAULT_COMPANY,
      a.nome || 'Sem nome', a.cpf, a.email,
      tel, a.whatsapp || tel,
      a.cidade, a.estado, a.cep,
      a.created_at, a.id,
      'IMPORTADO_LEGACY',
      a.created_at || new Date(),
      a.created_at || new Date(), new Date()
    ]);
    associadoMap.set(a.id, r.rows[0].id);
  }

  // 2.2 LEADS -> contacts (dedup) + leads + utm_attribution
  const oldLeads = (await oldC.query('SELECT * FROM leads ORDER BY created_at')).rows;
  log(`  leads: ${oldLeads.length}`);
  let leadsImp = 0, leadsSkp = 0, ctxNew = 0, ctxReuse = 0, utmIns = 0;
  for (const l of oldLeads) {
    const tel = l.telefone || l.whatsapp;
    let contactId;
    if (tel) {
      const r = await newC.query(`
        INSERT INTO core.contacts (
          company_id, nome, cpf, email, telefone, whatsapp, cidade, estado,
          primeiro_contato_origem, primeiro_contato_em, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (company_id, telefone) DO UPDATE SET
          nome = CASE WHEN core.contacts.nome IS NULL OR core.contacts.nome = '' OR core.contacts.nome = 'Sem nome' THEN EXCLUDED.nome ELSE core.contacts.nome END,
          email = COALESCE(core.contacts.email, EXCLUDED.email),
          cpf = COALESCE(core.contacts.cpf, EXCLUDED.cpf)
        RETURNING id, (xmax = 0) AS inserted
      `, [
        l.company_id || DEFAULT_COMPANY,
        l.nome || 'Sem nome', l.cpf, l.email,
        tel, l.whatsapp || tel,
        l.cidade, l.estado,
        l.origem || 'SITE',
        l.created_at, l.created_at, new Date()
      ]);
      contactId = r.rows[0].id;
      if (r.rows[0].inserted) ctxNew++; else ctxReuse++;
    } else if (l.nome) {
      // sem telefone — cria contact orfao
      const r = await newC.query(`
        INSERT INTO core.contacts (company_id, nome, email, primeiro_contato_origem, primeiro_contato_em, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
      `, [l.company_id || DEFAULT_COMPANY, l.nome, l.email, l.origem || 'SITE', l.created_at, l.created_at, new Date()]);
      contactId = r.rows[0].id;
      ctxNew++;
    } else {
      leadsSkp++;
      continue;
    }

    // Inserir core.leads
    let newLeadId;
    try {
      const r = await newC.query(`
        INSERT INTO core.leads (
          company_id, contact_id,
          placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_centavos,
          cotacao_plano, cotacao_valor_centavos, cotacao_enviada, cotacao_data,
          pdf_url, pdf_enviado, pdf_enviado_em,
          whatsapp_clicado, whatsapp_clicado_em,
          carro_app, leilao, seguro_atual,
          etapa_funil, status, motivo_perda,
          vendedor_id, qualificado_por, score_qualificacao,
          data_conversao, valor_compra_centavos, produto_comprado,
          quotation_code, negotiation_code,
          liberado_cadastro, liberado_cadastro_em, powercrm_payload,
          follow_up_enviado, follow_up_data,
          reengajamento_enviado, reengajamento_data,
          created_at, updated_at
        ) VALUES (
          $1, $2,
          $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16,
          $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25,
          $26, $27, $28,
          $29, $30,
          $31, $32, $33,
          $34, $35,
          $36, $37,
          $38, $39
        ) RETURNING id
      `, [
        l.company_id || DEFAULT_COMPANY, contactId,
        l.placa_interesse, l.marca_interesse, l.modelo_interesse, l.ano_interesse,
        cents(l.valor_fipe_consultado),
        l.cotacao_plano, cents(l.cotacao_valor),
        l.cotacao_enviada || false, l.cotacao_data,
        l.pdf_url, l.pdf_enviado || false, l.pdf_enviado_em,
        l.whatsapp_clicado || false, l.whatsapp_clicado_em,
        l.carro_app || false, l.leilao, l.seguro_atual,
        l.etapa_funil || 'NOVO',
        (l.status || 'OPEN').toUpperCase(), l.motivo_perda,
        l.vendedor_id, l.qualificado_por, l.score_qualificacao || 0,
        l.data_conversao, cents(l.valor_compra), l.produto_comprado,
        l.quotation_code, l.negotiation_code,
        l.liberado_cadastro || false, l.liberado_cadastro_em, toJsonb(l.powercrm_payload),
        l.follow_up_enviado || false, l.follow_up_data,
        l.reengajamento_enviado || false, l.reengajamento_data,
        l.created_at, l.updated_at
      ]);
      newLeadId = r.rows[0].id;
    } catch (e) {
      // Pode bater no UNIQUE de quotation_code/negotiation_code
      if (/quotation_code|negotiation_code/.test(e.message)) {
        // remove os codes duplicados e tenta de novo
        const r = await newC.query(`
          INSERT INTO core.leads (company_id, contact_id, placa_interesse, etapa_funil, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [l.company_id || DEFAULT_COMPANY, contactId, l.placa_interesse, l.etapa_funil || 'NOVO', (l.status || 'OPEN').toUpperCase(), l.created_at, l.updated_at]);
        newLeadId = r.rows[0].id;
      } else {
        log(`    lead erro: ${l.id} -> ${e.message.substring(0, 80)}`);
        leadsSkp++;
        continue;
      }
    }
    leadMap.set(l.id, { newLeadId, contactId });

    // tracking.utm_attribution
    if (l.trk || l.event_id || l.gclid || l.fbclid || l.utm_source || l.utm_campaign) {
      try {
        await newC.query(`
          INSERT INTO tracking.utm_attribution (
            lead_id, trk, event_id, ga_client_id, external_id,
            fbp, fbc, gclid, fbclid, gbraid, wbraid,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            referrer, landing_page, ip_address, user_agent, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19::inet, $20, $21
          )
          ON CONFLICT DO NOTHING
        `, [
          newLeadId, l.trk, l.event_id, l.ga_client_id, l.external_id,
          l.fbp, l.fbc, l.gclid, l.fbclid, l.gbraid, l.wbraid,
          l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term,
          l.referrer, l.landing_page,
          // Validar IP — se nao bater regex, manda null
          (l.ip_address && /^[0-9a-f.:]+$/i.test(l.ip_address)) ? l.ip_address : null,
          l.user_agent, l.created_at
        ]);
        utmIns++;
      } catch (e) {
        // ignora — pode ser conflict de trk/event_id
      }
    }

    leadsImp++;
  }
  log(`    -> leads importados: ${leadsImp}, skipped: ${leadsSkp}`);
  log(`    -> contacts criados: ${ctxNew}, reusados (dedup): ${ctxReuse}`);
  log(`    -> utm_attribution: ${utmIns}`);

  // 2.3 VEHICLES
  const oldVeh = (await oldC.query('SELECT * FROM vehicles')).rows;
  log(`  vehicles: ${oldVeh.length}`);
  let vehImp = 0, vehSkp = 0;
  for (const v of oldVeh) {
    const contactId = associadoMap.get(v.associado_id);
    if (!contactId) { vehSkp++; continue; }
    try {
      await newC.query(`
        INSERT INTO core.vehicles (
          company_id, contact_id,
          placa, renavam, chassi,
          marca, modelo, ano_fabricacao, ano_modelo, cor, combustivel, tipo,
          codigo_fipe, valor_fipe_centavos,
          plano, valor_mensal_centavos,
          tem_rastreador, rastreador_marca,
          vistoria_status, vistoria_data,
          ativo, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (company_id, placa) DO NOTHING
      `, [
        v.company_id || DEFAULT_COMPANY, contactId,
        v.placa, v.renavam, v.chassi,
        v.marca, v.modelo, v.ano_fabricacao, v.ano_modelo, v.cor, v.combustivel, v.tipo,
        v.codigo_fipe, cents(v.valor_fipe),
        v.plano, cents(v.valor_mensal),
        v.tem_rastreador || false, v.rastreador_marca,
        (v.vistoria_status || 'PENDENTE').toUpperCase(), v.vistoria_data,
        v.ativo !== false, v.created_at, v.updated_at
      ]);
      vehImp++;
    } catch (e) { log(`    vehicle erro: ${v.placa} -> ${e.message.substring(0, 80)}`); vehSkp++; }
  }
  log(`    -> vehicles: ${vehImp} importados, ${vehSkp} skipped`);

  // ═══════════════════════ ESTAGIO 3: CONVERSAS ═══════════════════════
  log('=== Estagio 3: conversas ===');

  // 3.1 CONVERSATIONS
  const oldConvs = (await oldC.query('SELECT * FROM conversations ORDER BY created_at')).rows;
  log(`  conversations: ${oldConvs.length}`);
  let convImp = 0, convSkp = 0, convCtxCreated = 0;
  for (const cv of oldConvs) {
    let contactId = null;

    if (cv.associado_id && associadoMap.has(cv.associado_id)) {
      contactId = associadoMap.get(cv.associado_id);
    } else if (cv.lead_id && leadMap.has(cv.lead_id)) {
      contactId = leadMap.get(cv.lead_id).contactId;
    }

    if (!contactId && cv.contact_phone) {
      const r = await newC.query(
        `SELECT id FROM core.contacts WHERE company_id=$1 AND telefone=public.normalize_phone($2)`,
        [cv.company_id || DEFAULT_COMPANY, cv.contact_phone]
      );
      if (r.rowCount > 0) contactId = r.rows[0].id;
    }

    if (!contactId && cv.contact_phone) {
      // Cria contact orfao
      const r = await newC.query(`
        INSERT INTO core.contacts (
          company_id, nome, telefone, whatsapp,
          primeiro_contato_origem, primeiro_contato_em, created_at, updated_at
        ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
        ON CONFLICT (company_id, telefone) DO UPDATE SET nome = COALESCE(NULLIF(core.contacts.nome, ''), EXCLUDED.nome)
        RETURNING id
      `, [
        cv.company_id || DEFAULT_COMPANY,
        cv.contact_name || cv.pushname || 'Contato WhatsApp',
        cv.contact_phone,
        'WHATSAPP', cv.created_at, cv.created_at, new Date()
      ]);
      contactId = r.rows[0].id;
      convCtxCreated++;
    }

    if (!contactId) { convSkp++; continue; }

    const channel = (() => {
      const ch = (cv.channel || 'whatsapp').toLowerCase();
      if (ch === 'whatsapp' || ch === 'whatsapp_evolution') return 'WHATSAPP_EVOLUTION';
      if (ch === 'whatsapp_oficial' || ch === 'meta') return 'WHATSAPP_OFICIAL';
      if (ch === 'instagram') return 'INSTAGRAM';
      return ch.toUpperCase();
    })();

    try {
      const r = await newC.query(`
        INSERT INTO chat.conversations (
          company_id, contact_id, channel, evolution_instance, jid,
          status, unread_count, total_messages,
          contact_phone, contact_name, pushname, profile_pic_url,
          first_inbound_at, first_outbound_at, last_message_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          public.normalize_phone($9), $10, $11, $12,
          $13, $14, $15,
          $16, $17
        ) RETURNING id
      `, [
        cv.company_id || DEFAULT_COMPANY, contactId, channel, cv.evolution_instance, cv.jid,
        (cv.status || 'OPEN').toUpperCase(),
        cv.unread_count || 0, cv.total_messages || 0,
        cv.contact_phone || '',
        cv.contact_name, cv.pushname, cv.profile_pic_url,
        cv.first_inbound_at, cv.first_outbound_at, cv.last_message_at || cv.created_at,
        cv.created_at, cv.updated_at
      ]);
      conversationMap.set(cv.id, r.rows[0].id);
      convImp++;
    } catch (e) {
      log(`    conv erro: ${cv.id} -> ${e.message.substring(0, 100)}`);
      convSkp++;
    }
  }
  log(`    -> conversations: ${convImp} importados, ${convSkp} skipped, ${convCtxCreated} contacts orfaos criados`);

  // 3.2 MESSAGES
  const oldMsgs = (await oldC.query('SELECT * FROM messages ORDER BY created_at')).rows;
  log(`  messages: ${oldMsgs.length}`);
  let msgImp = 0, msgSkp = 0;
  // Cache: convId -> { contactId, companyId } pra evitar lookup repetido
  const convCache = new Map();

  for (const m of oldMsgs) {
    const newConvId = conversationMap.get(m.conversation_id);
    if (!newConvId) { msgSkp++; continue; }

    let cInfo = convCache.get(newConvId);
    if (!cInfo) {
      const r = await newC.query('SELECT contact_id, company_id FROM chat.conversations WHERE id = $1', [newConvId]);
      if (r.rowCount === 0) { msgSkp++; continue; }
      cInfo = { contactId: r.rows[0].contact_id, companyId: r.rows[0].company_id };
      convCache.set(newConvId, cInfo);
    }

    const direction = (m.direction || 'INBOUND').toUpperCase();
    if (direction !== 'INBOUND' && direction !== 'OUTBOUND') {
      msgSkp++;
      continue;
    }
    const senderType = direction === 'INBOUND' ? 'CONTACT' : 'HUMAN';
    const messageType = (m.message_type || 'TEXT').toUpperCase();
    let status = (m.status || 'PENDING').toUpperCase();
    // Ajustar valores legados
    if (status === 'SERVER_ACK') status = 'SERVER_ACK';
    if (!['PENDING','SENT','SERVER_ACK','DELIVERED','READ','FAILED','RECEIVED'].includes(status)) {
      status = direction === 'INBOUND' ? 'RECEIVED' : 'SENT';
    }

    try {
      await newC.query(`
        INSERT INTO chat.messages (
          company_id, conversation_id, contact_id,
          direction, sender_type, sender_id,
          message_type, content, caption, media_url, media_mime_type, media_filename,
          whatsapp_message_id, evolution_instance, jid, pushname,
          status, sent_at, delivered_at, read_at,
          raw_payload, created_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22
        )
        ON CONFLICT DO NOTHING
      `, [
        cInfo.companyId, newConvId, cInfo.contactId,
        direction, senderType, m.sender_id,
        messageType, m.content, m.caption, m.media_url, m.media_mime_type, m.media_filename,
        m.whatsapp_message_id, m.evolution_instance, m.jid, m.pushname,
        status, m.sent_at, m.delivered_at, m.read_at,
        m.raw_payload, m.created_at
      ]);
      msgImp++;
    } catch (e) {
      msgSkp++;
      if (msgSkp <= 3) log(`    msg erro: ${m.id} -> ${e.message.substring(0, 80)}`);
    }
  }
  log(`    -> messages: ${msgImp} importados, ${msgSkp} skipped`);

  // ═══════════════════════ ESTAGIO 4: CRM OPS ═══════════════════════
  log('=== Estagio 4: CRM ops ===');

  // 4.1 CARDS
  const oldCards = (await oldC.query('SELECT * FROM cards')).rows;
  log(`  cards: ${oldCards.length}`);
  let cardImp = 0, cardSkp = 0;
  for (const c of oldCards) {
    try {
      await newC.query(`
        INSERT INTO crm.cards (id, company_id, pipe_id, current_phase_id, title, description, status, created_by_id, assigned_to_id, due_date, completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `, [c.id, c.company_id || DEFAULT_COMPANY, c.pipe_id, c.current_phase_id, c.title || 'Sem titulo', c.description, (c.status || 'OPEN').toUpperCase(), c.created_by_id, c.assigned_to_id, c.due_date, c.completed_at, c.created_at, c.updated_at]);
      cardImp++;
    } catch (e) { log(`    card erro: ${c.id} -> ${e.message.substring(0, 80)}`); cardSkp++; }
  }
  log(`    -> cards: ${cardImp} importados, ${cardSkp} skipped`);

  // 4.2 SINISTROS
  const oldSin = (await oldC.query('SELECT * FROM sinistros')).rows;
  log(`  sinistros: ${oldSin.length}`);
  let sinImp = 0, sinSkp = 0;
  for (const s of oldSin) {
    const contactId = associadoMap.get(s.associado_id);
    if (!contactId) { sinSkp++; continue; }
    const v = await newC.query('SELECT id FROM core.vehicles WHERE contact_id=$1 LIMIT 1', [contactId]);
    if (v.rowCount === 0) { sinSkp++; continue; }
    try {
      await newC.query(`
        INSERT INTO crm.sinistros (
          company_id, contact_id, vehicle_id, oficina_id, responsavel_id,
          numero_sinistro, tipo, descricao, data_ocorrencia, local_ocorrencia,
          status, valor_estimado_centavos, valor_pago_centavos, encerrado_em,
          fotos_urls, documentos_urls, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        s.company_id || DEFAULT_COMPANY, contactId, v.rows[0].id,
        oficinaMap.get(s.oficina_id) || null, s.responsavel_id,
        s.numero_sinistro || s.numero || null,
        (s.tipo || 'OUTRO').toUpperCase(),
        s.descricao,
        s.data_ocorrencia || s.created_at,
        toJsonb(s.local_ocorrencia),
        (s.status || 'ABERTO').toUpperCase(),
        cents(s.valor_estimado), cents(s.valor_pago),
        s.encerrado_em, s.fotos_urls, s.documentos_urls,
        s.created_at, s.updated_at || s.created_at
      ]);
      sinImp++;
    } catch (e) { log(`    sinistro erro: ${s.id} -> ${e.message.substring(0, 80)}`); sinSkp++; }
  }
  log(`    -> sinistros: ${sinImp} importados, ${sinSkp} skipped`);

  // 4.3 NPS
  const oldNps = (await oldC.query('SELECT * FROM nps_surveys')).rows;
  log(`  nps_surveys: ${oldNps.length}`);
  let npsImp = 0, npsSkp = 0;
  for (const n of oldNps) {
    const contactId = associadoMap.get(n.associado_id);
    if (!contactId) { npsSkp++; continue; }
    try {
      await newC.query(`
        INSERT INTO crm.nps_surveys (company_id, contact_id, trigger_event, enviada_em, respondida_em, score, comment, classificacao, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        n.company_id || DEFAULT_COMPANY, contactId,
        (n.trigger_event || 'POS_ONBOARDING').toUpperCase(),
        n.enviada_em, n.respondida_em, n.score, n.comment,
        n.classificacao || (n.score == null ? null : n.score >= 9 ? 'PROMOTOR' : n.score >= 7 ? 'NEUTRO' : 'DETRATOR'),
        n.created_at
      ]);
      npsImp++;
    } catch (e) { log(`    nps erro: ${n.id} -> ${e.message.substring(0, 80)}`); npsSkp++; }
  }
  log(`    -> nps: ${npsImp} importados, ${npsSkp} skipped`);

  // 4.4 BOLETOS
  const oldBol = (await oldC.query('SELECT * FROM boletos')).rows;
  log(`  boletos: ${oldBol.length}`);
  let bolImp = 0, bolSkp = 0;
  for (const b of oldBol) {
    const contactId = associadoMap.get(b.associado_id);
    if (!contactId) { bolSkp++; continue; }
    try {
      await newC.query(`
        INSERT INTO crm.boletos (company_id, contact_id, numero, valor_centavos, vencimento, pago_em, valor_pago_centavos, status, url_pdf, linha_digitavel, hinova_boleto_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (numero) DO NOTHING
      `, [
        b.company_id || DEFAULT_COMPANY, contactId,
        b.numero, cents(b.valor) || 0, b.vencimento,
        b.pago_em, cents(b.valor_pago),
        (b.status || 'ABERTO').toUpperCase(),
        b.url_pdf, b.linha_digitavel,
        b.hinova_boleto_id || b.id,
        b.created_at, b.updated_at || b.created_at
      ]);
      bolImp++;
    } catch (e) { log(`    boleto erro: ${b.id} -> ${e.message.substring(0, 80)}`); bolSkp++; }
  }
  log(`    -> boletos: ${bolImp} importados, ${bolSkp} skipped`);

  // 4.5 PROJETOS
  const oldProj = (await oldC.query('SELECT * FROM projetos')).rows;
  log(`  projetos: ${oldProj.length}`);
  let projImp = 0;
  for (const p of oldProj) {
    try {
      await newC.query(`
        INSERT INTO crm.projetos (company_id, nome, descricao, status, responsavel_id, prazo, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        p.company_id || DEFAULT_COMPANY,
        p.nome || p.name || 'Sem nome', p.descricao || p.description,
        (p.status || 'EM_ANDAMENTO').toUpperCase(),
        p.responsavel_id, p.prazo,
        toJsonb(p.metadata), p.created_at, p.updated_at || p.created_at
      ]);
      projImp++;
    } catch (e) { log(`    projeto erro: ${p.id} -> ${e.message.substring(0, 80)}`); }
  }
  log(`    -> projetos: ${projImp} importados`);

  // ─── Re-habilitar triggers ───
  log('Re-habilitando triggers...');
  await newC.query(`
    ALTER TABLE chat.messages ENABLE TRIGGER trg_msg_update_conversation;
    ALTER TABLE chat.messages ENABLE TRIGGER trg_temp_on_message;
    ALTER TABLE core.leads ENABLE TRIGGER trg_temp_on_lead;
    ALTER TABLE core.leads ENABLE TRIGGER trg_log_lead_status;
    ALTER TABLE core.contacts ENABLE TRIGGER trg_temp_on_associado;
  `);

  // ─── Recalcular contadores derivados ───
  log('Recalculando conversation counters + temperature...');
  await newC.query(`
    UPDATE chat.conversations c SET
      total_messages = (SELECT count(*) FROM chat.messages WHERE conversation_id = c.id),
      last_message_at = COALESCE((SELECT max(created_at) FROM chat.messages WHERE conversation_id = c.id), c.last_message_at),
      first_inbound_at = (SELECT min(created_at) FROM chat.messages WHERE conversation_id = c.id AND direction = 'INBOUND'),
      first_outbound_at = (SELECT min(created_at) FROM chat.messages WHERE conversation_id = c.id AND direction = 'OUTBOUND')
  `);

  // recompute temperature pra cada contact
  await newC.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT id FROM core.contacts LOOP
        PERFORM core.fn_recompute_temperature(r.id);
      END LOOP;
    END $$;
  `);
  log('  temperature recalculada para todos os contacts');

  // ═══════════════════════ ESTAGIO 5: RECONCILIACAO ═══════════════════════
  log('=== Estagio 5: reconciliacao ===');
  const recon = [
    ['users',                   'crm.users'],
    ['pipes',                   'crm.pipes'],
    ['phases',                  'crm.phases'],
    ['oficinas',                'crm.oficinas'],
    ['whatsapp_instances',      'ops.whatsapp_instances'],
    ['leads',                   'core.leads'],
    ['vehicles',                'core.vehicles'],
    ['conversations',           'chat.conversations'],
    ['messages',                'chat.messages'],
    ['cards',                   'crm.cards'],
    ['sinistros',               'crm.sinistros'],
    ['nps_surveys',             'crm.nps_surveys'],
    ['boletos',                 'crm.boletos'],
    ['projetos',                'crm.projetos'],
  ];
  console.log('\n┌──────────────────────────────────────┬─────────┬─────────┬───────┐');
  console.log('│ Tabela antigo -> novo                │ Antigo  │ Novo    │ Match │');
  console.log('├──────────────────────────────────────┼─────────┼─────────┼───────┤');
  let okCount = 0, divCount = 0;
  for (const [oldT, newT] of recon) {
    const oldCount = (await oldC.query(`SELECT count(*)::int AS n FROM ${oldT}`)).rows[0].n;
    const newCount = (await newC.query(`SELECT count(*)::int AS n FROM ${newT}`)).rows[0].n;
    const match = oldCount === newCount ? '  OK  ' : (newCount > oldCount ? ' MAIS ' : 'PERDA!');
    if (oldCount === newCount) okCount++; else divCount++;
    console.log(`│ ${(oldT + ' -> ' + newT).padEnd(37)}│ ${String(oldCount).padStart(6)}  │ ${String(newCount).padStart(6)}  │ ${match}│`);
  }
  console.log('└──────────────────────────────────────┴─────────┴─────────┴───────┘');
  console.log(`\nResumo: ${okCount} tabelas casaram, ${divCount} divergiram.`);

  // Contacts derivados
  const oldAss = (await oldC.query('SELECT count(*)::int AS n FROM associados')).rows[0].n;
  const oldLea = (await oldC.query('SELECT count(*)::int AS n FROM leads')).rows[0].n;
  const newCx = (await newC.query('SELECT count(*)::int AS n FROM core.contacts')).rows[0].n;
  const newAssoc = (await newC.query('SELECT count(*)::int AS n FROM core.contacts WHERE is_associado=true')).rows[0].n;
  console.log(`\ncore.contacts: ${newCx} total (${newAssoc} sao associados, ${newCx - newAssoc} so leads)`);
  console.log(`Origem: ${oldAss} associados + ${oldLea} leads -> ${newCx} contacts unicos (dedup salvou ${(oldAss + oldLea) - newCx} duplicados)`);

  // Temperature
  const tempDist = await newC.query('SELECT status, count(*)::int AS n FROM core.contact_temperature GROUP BY status ORDER BY n DESC');
  console.log('\nDistribuicao de temperature:');
  for (const r of tempDist.rows) console.log(`  ${r.status}: ${r.n}`);

  await oldC.end();
  await newC.end();
  log('FIM ETL.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
