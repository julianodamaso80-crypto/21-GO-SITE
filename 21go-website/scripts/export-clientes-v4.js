// Critério final: TODO cliente que recebeu mensagem (PDF, qualquer texto, etc) e
// NUNCA respondeu. Separado em 3 abas por número MEU (4882, 0824, 4169).
const { Client } = require('pg')
const XLSX = require('xlsx')

const EVO_URL = 'https://automacoes-evolution-api.klo3fa.easypanel.host'
const KEY = '52DE882E153D-40EF-BD72-946FEB2E5C1F'
const CHIPS_4882 = new Set(['21gosite', '21GO2', 'site21go'])
const CUTOFF_4169 = '2026-05-06T02:45:45'
const CONCURRENCY = 12

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

async function fetchPushNames(tels) {
  const map = new Map()
  const queue = [...tels]
  async function worker() {
    while (queue.length) {
      const tel = queue.shift()
      const name = await evoFindContact(tel)
      if (name) map.set(tel, name)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return map
}

function decideNome(pushName, nomeForm) {
  if (pushName) return pushName
  const n = (nomeForm || '').trim()
  if (/^21\s*go$/i.test(n) || /^teste/i.test(n) || !n) return '(sem nome)'
  return n
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

  console.log('Carregando todos com critério unificado (recebeu msg + zero resposta)...')

  const rows = (await c.query(
    `WITH base AS (
       -- A: leads que receberam PDF/cotacao OU tem qualquer outbound (msg do nosso lado)
       SELECT
         COALESCE(l.nome, '') AS nome_form,
         COALESCE(l.whatsapp, l.telefone) AS tel,
         l.created_at AS dt,
         COALESCE(
           (SELECT evolution_instance FROM public.messages WHERE lead_id=l.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1),
           l.evolution_instance
         ) AS chip
       FROM public.leads l
       LEFT JOIN (SELECT lead_id, count(*) AS inb FROM public.messages WHERE direction='inbound' GROUP BY lead_id) m ON m.lead_id = l.id
       WHERE (
         l.cotacao_enviada=true
         OR l.pdf_enviado=true
         OR EXISTS (SELECT 1 FROM public.messages mm WHERE mm.lead_id=l.id AND mm.direction='outbound')
       )
       AND COALESCE(m.inb,0)=0
       AND COALESCE(l.whatsapp, l.telefone) IS NOT NULL

       UNION ALL

       -- B: conversations só outbound (mesmo sem lead vinculado)
       SELECT
         COALESCE(l.nome, cv.contact_name, cv.pushname, '') AS nome_form,
         cv.contact_phone AS tel,
         cv.created_at AS dt,
         (SELECT evolution_instance FROM public.messages WHERE conversation_id=cv.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1) AS chip
       FROM public.conversations cv
       LEFT JOIN public.leads l ON l.id = cv.lead_id
       WHERE cv.contact_phone IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.messages mm WHERE mm.conversation_id = cv.id AND mm.direction='outbound')
         AND NOT EXISTS (SELECT 1 FROM public.messages mm WHERE mm.conversation_id = cv.id AND mm.direction='inbound')
     ),
     dedup AS (
       SELECT
         tel,
         (array_agg(nome_form ORDER BY length(nome_form) DESC NULLS LAST) FILTER (WHERE nome_form != ''))[1] AS nome_form,
         max(dt) AS ultimo_contato,
         (array_agg(chip ORDER BY dt DESC NULLS LAST) FILTER (WHERE chip IS NOT NULL))[1] AS chip
       FROM base WHERE tel IS NOT NULL GROUP BY tel
     )
     SELECT * FROM dedup ORDER BY tel`,
  )).rows

  await c.end()
  console.log(`Total únicos: ${rows.length}`)

  console.log(`Consultando pushName via Evolution (concorrência ${CONCURRENCY})...`)
  const t0 = Date.now()
  const pushMap = await fetchPushNames(rows.map(r => r.tel))
  console.log(`Concluído em ${Math.round((Date.now() - t0) / 1000)}s. ${pushMap.size} pushNames recuperados.`)

  // Distribuição por aba
  const abas = { '4882': [], '0824': [], '4169': [] }
  for (const r of rows) {
    let aba
    if (r.ultimo_contato < new Date(CUTOFF_4169)) aba = '4169'
    else if (CHIPS_4882.has(r.chip)) aba = '4882'
    else aba = '0824'
    abas[aba].push({
      'Nome do Cliente': decideNome(pushMap.get(r.tel), r.nome_form),
      'Contato do Cliente': r.tel,
    })
  }

  // Gera XLSX
  const wb = XLSX.utils.book_new()
  const ordem = [
    ['4882', 'Aba 1 - 4882'],
    ['0824', 'Aba 2 - 0824'],
    ['4169', 'Aba 3 - 4169'],
  ]
  for (const [key, nome] of ordem) {
    const ws = XLSX.utils.json_to_sheet(abas[key])
    ws['!cols'] = [{ wch: 38 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, nome)
  }

  const out = 'C:/Users/damas/Downloads/clientes_sem_resposta.xlsx'
  XLSX.writeFile(wb, out)

  console.log('\n=== RESUMO FINAL ===')
  console.log(`Aba 4882: ${abas['4882'].length} clientes`)
  console.log(`Aba 0824: ${abas['0824'].length} clientes`)
  console.log(`Aba 4169: ${abas['4169'].length} clientes`)
  console.log(`Total:    ${rows.length}`)
  console.log(`Arquivo:  ${out}`)
})().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
