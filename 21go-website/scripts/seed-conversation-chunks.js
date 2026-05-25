// =============================================================================
// FASE 1.C — Indexar 1.533 mensagens como conversation_chunks
// Janelas de 4-8 mensagens consecutivas, com metadata (outcome, vehicle_type).
// =============================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const WINDOW_SIZE = 6;          // alvo de mensagens por chunk
const MIN_WINDOW = 3;            // chunk minimo
const STRIDE = 4;                // overlap (window 6, stride 4 = sobrepoe 2)

function detectVehicleType(metadata) {
  if (!metadata) return 'desconhecido';
  const m = (metadata.placa_interesse || metadata.marca_interesse || '').toLowerCase();
  if (/honda\s+cg|yamaha|moto|cb\s+\d/.test(m)) return 'moto';
  if (/hilux|ranger|amarok|s10|frontier|saveiro|strada|hr-v|kicks|t-cross|compass|renegade|tracker|duster|ecosport/.test(m)) return 'suv';
  if (m) return 'carro';
  return 'desconhecido';
}

function determineOutcome(contact, lead) {
  if (contact?.is_associado) return 'won';
  if (lead?.status === 'LOST' || lead?.etapa_funil === 'PERDIDO') return 'lost';
  return 'in_progress';
}

function detectFlags(messagesWindow) {
  const allText = messagesWindow.map(m => m.content || '').join(' ').toLowerCase();
  return {
    contains_price: /\br\$|reais|mensal|valor|preco|preço|cota|mensalidade/.test(allText),
    contains_fipe: /fipe|tabela/.test(allText),
  };
}

function narrateWindow(msgs) {
  // Renderiza msgs como texto ("CLIENTE: ..." / "ATENDENTE: ...") pra embed
  return msgs.map(m => {
    const who = m.direction === 'INBOUND' ? 'CLIENTE' : 'ATENDENTE';
    const content = (m.content || '').slice(0, 600);
    return `${who}: ${content}`;
  }).join('\n');
}

(async () => {
  const c = new Client({
    host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432,
    user: 'postgres.dsclaxtvcbbuxmtmpxpf', password: 'GuI1616GuI@',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Aplica migration 200
  console.log('Aplicando migration 200 (tabela + ajuste BGE-M3)...');
  const sql200 = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '200_conversation_chunks_and_bge.sql'),
    'utf8'
  );
  await c.query(sql200);
  console.log('  OK');

  // Limpa
  await c.query('TRUNCATE ai.conversation_chunks RESTART IDENTITY');

  // Pega todas as conversations com seus contacts e leads
  const convs = (await c.query(`
    SELECT
      cv.id AS conversation_id, cv.contact_id, cv.contact_phone, cv.contact_name,
      ct.is_associado,
      l.id AS lead_id, l.status, l.etapa_funil, l.placa_interesse, l.marca_interesse, l.modelo_interesse,
      l.valor_fipe_centavos, l.cotacao_plano
    FROM chat.conversations cv
    LEFT JOIN core.contacts ct ON ct.id = cv.contact_id
    LEFT JOIN LATERAL (
      SELECT * FROM core.leads WHERE contact_id = cv.contact_id ORDER BY created_at DESC LIMIT 1
    ) l ON true
    ORDER BY cv.created_at
  `)).rows;
  console.log(`Conversas: ${convs.length}`);

  let totalChunks = 0;
  let totalSkipped = 0;
  for (const cv of convs) {
    const msgs = (await c.query(
      `SELECT id, direction, sender_type, message_type, content, caption, created_at
       FROM chat.messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [cv.conversation_id]
    )).rows;

    if (msgs.length < MIN_WINDOW) {
      totalSkipped++;
      continue;
    }

    const outcome = determineOutcome(cv, cv);
    const vehicleType = detectVehicleType(cv);

    // Janelas com overlap
    let chunkIdx = 0;
    for (let start = 0; start < msgs.length; start += STRIDE) {
      const end = Math.min(start + WINDOW_SIZE, msgs.length);
      const window = msgs.slice(start, end);
      if (window.length < MIN_WINDOW) break;

      const narrated = narrateWindow(window);
      if (narrated.length < 100) continue;

      const flags = detectFlags(window);
      const messagesWindowJson = window.map(m => ({
        direction: m.direction,
        sender_type: m.sender_type,
        type: m.message_type,
        content: (m.content || '').slice(0, 800),
        ts: m.created_at,
      }));

      await c.query(
        `INSERT INTO ai.conversation_chunks (
           conversation_id, contact_id, chunk_index, content, messages_window,
           outcome, vehicle_type, contains_price, contains_fipe, msg_count, metadata
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb)
         ON CONFLICT (conversation_id, chunk_index) DO NOTHING`,
        [
          cv.conversation_id, cv.contact_id, chunkIdx, narrated,
          JSON.stringify(messagesWindowJson),
          outcome, vehicleType,
          flags.contains_price, flags.contains_fipe, window.length,
          JSON.stringify({
            contact_phone: cv.contact_phone,
            placa: cv.placa_interesse,
            marca: cv.marca_interesse,
            modelo: cv.modelo_interesse,
            plano_interesse: cv.cotacao_plano,
          })
        ]
      );
      chunkIdx++;
      totalChunks++;

      if (end >= msgs.length) break;
    }
  }

  console.log(`\nTotal: ${totalChunks} chunks de conversa (de ${convs.length} conversas, ${totalSkipped} skipped por <${MIN_WINDOW} msgs)`);

  const stats = await c.query(`
    SELECT outcome, vehicle_type, count(*)::int AS chunks
    FROM ai.conversation_chunks
    GROUP BY outcome, vehicle_type
    ORDER BY chunks DESC
  `);
  console.log('\nDistribuicao:');
  for (const r of stats.rows) {
    console.log(`  ${r.outcome.padEnd(15)} ${r.vehicle_type.padEnd(15)} ${String(r.chunks).padStart(5)} chunks`);
  }

  const flagStats = await c.query(`
    SELECT
      sum(CASE WHEN contains_price THEN 1 ELSE 0 END)::int AS price,
      sum(CASE WHEN contains_fipe THEN 1 ELSE 0 END)::int AS fipe,
      avg(msg_count)::numeric(10,1) AS avg_msgs,
      avg(length(content))::int AS avg_chars
    FROM ai.conversation_chunks
  `);
  console.log('\nFlags + medias:', flagStats.rows[0]);

  await c.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
