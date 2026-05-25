// Exporta XLSX com 2 abas (por meu chip) e enriquece com pushName via Evolution
const { Client } = require('pg')
const XLSX = require('xlsx')

const EVO_URL = 'https://automacoes-evolution-api.klo3fa.easypanel.host'
const KEY = '52DE882E153D-40EF-BD72-946FEB2E5C1F'
const CONCURRENCY = 12

// Mapa chip -> ultimos 4 dígitos do número MEU
const CHIP_TO_LAST4 = {
  '21gosite': '4882',
  '21GO2': '4882',
  // demais chips desconectados — agrupa em "outro"
}

async function evoFindContact(tel) {
  const jid = tel + '@s.whatsapp.net'
  for (const inst of ['21gosite', '21GO2', 'site21go', '21gosite2']) {
    try {
      const r = await fetch(`${EVO_URL}/chat/findContacts/${inst}`, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: { remoteJid: jid } }),
      })
      if (r.status === 200) {
        const data = await r.json()
        const c = Array.isArray(data) ? data[0] : null
        if (c && c.pushName && c.pushName.trim()) return c.pushName.trim()
      }
    } catch {}
  }
  return null
}

async function processBatch(tels, onProgress) {
  const map = new Map()
  let done = 0
  const queue = [...tels]
  async function worker() {
    while (queue.length) {
      const tel = queue.shift()
      const name = await evoFindContact(tel)
      if (name) map.set(tel, name)
      done++
      if (done % 50 === 0) onProgress(done, tels.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return map
}

;(async () => {
  const c = new Client({
    host: 'aws-1-sa-east-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.noawceqgqfwtpnrzmvdo',
    password: 'GuI1616GuI@',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  console.log('Query: dedup de 1.071 contatos...')
  const rows = (await c.query(`
    WITH g1 AS (
      SELECT
        COALESCE(l.nome, '') AS nome_form,
        COALESCE(l.whatsapp, l.telefone) AS telefone,
        COALESCE(
          (SELECT evolution_instance FROM public.messages WHERE lead_id = l.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1),
          l.evolution_instance
        ) AS chip
      FROM public.leads l
      LEFT JOIN (
        SELECT lead_id, count(*) AS inb FROM public.messages WHERE direction='inbound' GROUP BY lead_id
      ) m ON m.lead_id = l.id
      WHERE (l.cotacao_enviada=true OR l.pdf_enviado=true) AND COALESCE(m.inb,0)=0
        AND COALESCE(l.whatsapp, l.telefone) IS NOT NULL
    ),
    g2 AS (
      WITH cnt AS (
        SELECT conversation_id,
               count(*) FILTER (WHERE direction='inbound') AS inb,
               count(*) FILTER (WHERE direction='outbound') AS outb
        FROM public.messages GROUP BY conversation_id
      )
      SELECT
        COALESCE(l.nome, cv.contact_name, cv.pushname, '') AS nome_form,
        cv.contact_phone AS telefone,
        (SELECT evolution_instance FROM public.messages WHERE conversation_id=cv.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1) AS chip
      FROM public.conversations cv
      JOIN cnt ON cnt.conversation_id = cv.id
      LEFT JOIN public.leads l ON l.id = cv.lead_id
      WHERE cnt.inb = 0 AND cnt.outb >= 1
        AND cv.contact_phone IS NOT NULL
    ),
    todos AS (SELECT * FROM g1 UNION ALL SELECT * FROM g2)
    SELECT MAX(NULLIF(nome_form, '')) AS nome_form, telefone, MAX(chip) AS chip
    FROM todos GROUP BY telefone ORDER BY telefone
  `)).rows

  await c.end()
  console.log(`Total unicos: ${rows.length}`)

  const tels = rows.map(r => r.telefone)
  console.log(`Consultando Evolution (concorrencia ${CONCURRENCY})...`)
  const t0 = Date.now()
  const pushMap = await processBatch(tels, (d, t) => {
    process.stdout.write(`\r  ${d}/${t} (${Math.round(100 * d / t)}%)        `)
  })
  console.log(`\nConsulta concluida em ${Math.round((Date.now() - t0) / 1000)}s. ${pushMap.size} com pushName.`)

  // Agrupa por aba (chip → last4)
  const aba4882 = []
  const abaOutro = []

  for (const r of rows) {
    const pushName = pushMap.get(r.telefone) || null
    const last4 = CHIP_TO_LAST4[r.chip] || 'outro'
    // Decide nome final: pushName real do WhatsApp > nome_form (se não for "21 Go")
    const nomeFormClean = (r.nome_form || '').trim()
    let nomeFinal
    if (pushName) {
      nomeFinal = pushName
    } else if (/^21\s*go$/i.test(nomeFormClean) || nomeFormClean.toLowerCase() === 'teste 21gosite2' || !nomeFormClean) {
      nomeFinal = '(sem nome)'
    } else {
      nomeFinal = nomeFormClean
    }
    const linha = {
      'Nome do Cliente': nomeFinal,
      'Contato do Cliente': r.telefone,
    }
    if (last4 === '4882') aba4882.push(linha)
    else abaOutro.push(linha)
  }

  // Gera XLSX
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(aba4882)
  const ws2 = XLSX.utils.json_to_sheet(abaOutro)
  ws1['!cols'] = [{ wch: 38 }, { wch: 20 }]
  ws2['!cols'] = [{ wch: 38 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Aba 4882')
  XLSX.utils.book_append_sheet(wb, ws2, 'Aba Outro')

  const out = 'C:/Users/damas/Downloads/clientes_disparo_v2.xlsx'
  XLSX.writeFile(wb, out)

  console.log('\n=== RESUMO ===')
  console.log(`Aba 4882  (chips 21gosite + 21GO2): ${aba4882.length} clientes`)
  console.log(`Aba Outro (chips desconectados):    ${abaOutro.length} clientes`)
  console.log(`pushName recuperados:               ${pushMap.size}`)
  console.log(`Arquivo: ${out}`)
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
