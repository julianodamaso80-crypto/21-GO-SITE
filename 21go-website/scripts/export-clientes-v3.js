// XLSX final com 3 abas (4882, 0824, 4169), dedup com prioridade pro mais recente
const { Client } = require('pg')
const XLSX = require('xlsx')

const EVO_URL = 'https://automacoes-evolution-api.klo3fa.easypanel.host'
const KEY = '52DE882E153D-40EF-BD72-946FEB2E5C1F'
const CONCURRENCY = 12
const CUTOFF_4169 = '2026-05-06T02:45:45' // antes disso = chip 4169

// chips → aba (4882 = atual; outros = 0824)
const CHIP_4882 = new Set(['21gosite', '21GO2', 'site21go'])
// chips desconectados que viram 0824: 21gosite2, botwpp_site

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

  console.log('Carregando todos os clientes sem resposta...')

  // 1. Período 4882/0824 (após cutoff) — leads com PDF/cotacao + sem resposta E conversas só outbound
  const recentes = (await c.query(
    `WITH g1 AS (
       SELECT
         COALESCE(l.nome, '') AS nome_form,
         COALESCE(l.whatsapp, l.telefone) AS telefone,
         COALESCE(
           (SELECT evolution_instance FROM public.messages WHERE lead_id = l.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1),
           l.evolution_instance
         ) AS chip,
         l.created_at AS dt
       FROM public.leads l
       LEFT JOIN (SELECT lead_id, count(*) AS inb FROM public.messages WHERE direction='inbound' GROUP BY lead_id) m ON m.lead_id = l.id
       WHERE (l.cotacao_enviada=true OR l.pdf_enviado=true)
         AND COALESCE(m.inb,0)=0
         AND l.created_at >= $1
         AND COALESCE(l.whatsapp, l.telefone) IS NOT NULL
     ),
     g2 AS (
       WITH cnt AS (
         SELECT conversation_id,
                count(*) FILTER (WHERE direction='inbound') AS inb,
                count(*) FILTER (WHERE direction='outbound') AS outb,
                min(created_at) AS primeira
         FROM public.messages GROUP BY conversation_id
       )
       SELECT
         COALESCE(l.nome, cv.contact_name, cv.pushname, '') AS nome_form,
         cv.contact_phone AS telefone,
         (SELECT evolution_instance FROM public.messages WHERE conversation_id=cv.id AND direction='outbound' ORDER BY created_at DESC LIMIT 1) AS chip,
         cnt.primeira AS dt
       FROM public.conversations cv
       JOIN cnt ON cnt.conversation_id = cv.id
       LEFT JOIN public.leads l ON l.id = cv.lead_id
       WHERE cnt.inb = 0 AND cnt.outb >= 1
         AND cnt.primeira >= $1
         AND cv.contact_phone IS NOT NULL
     )
     SELECT * FROM g1 UNION ALL SELECT * FROM g2`,
    [CUTOFF_4169],
  )).rows

  // 2. Período 4169 (antes do cutoff)
  const antigos = (await c.query(
    `WITH a AS (
       SELECT COALESCE(l.nome, '') AS nome_form,
              COALESCE(l.whatsapp, l.telefone) AS telefone
       FROM public.leads l
       WHERE l.created_at < $1
         AND COALESCE(l.whatsapp, l.telefone) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.lead_id = l.id AND m.direction='inbound')
     ),
     b AS (
       SELECT COALESCE(l.nome, cv.contact_name, cv.pushname, '') AS nome_form,
              cv.contact_phone AS telefone
       FROM public.conversations cv
       LEFT JOIN public.leads l ON l.id = cv.lead_id
       WHERE cv.created_at < $1
         AND cv.contact_phone IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = cv.id AND m.direction='inbound')
         AND EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = cv.id AND m.direction='outbound')
     )
     SELECT * FROM a UNION ALL SELECT * FROM b`,
    [CUTOFF_4169],
  )).rows

  // Dedup: prioridade 4882 > 0824 > 4169 (mais recente vence)
  const tels = new Map() // tel -> { aba, nome_form }
  // Primeiro adiciona 4169 (menor prioridade)
  for (const r of antigos) {
    if (!tels.has(r.telefone)) tels.set(r.telefone, { aba: '4169', nome_form: r.nome_form })
  }
  // Depois 0824 e 4882 (sobrescreve)
  for (const r of recentes) {
    const aba = CHIP_4882.has(r.chip) ? '4882' : '0824'
    tels.set(r.telefone, { aba, nome_form: r.nome_form })
  }

  console.log(`Total unicos: ${tels.size}`)

  // Busca pushName de TODOS (concorrência 12)
  console.log(`Consultando pushName de ${tels.size} contatos...`)
  const t0 = Date.now()
  const pushMap = await fetchPushNames([...tels.keys()])
  console.log(`Concluido em ${Math.round((Date.now() - t0) / 1000)}s. ${pushMap.size} com pushName.`)

  // Monta abas
  const abas = { '4882': [], '0824': [], '4169': [] }
  for (const [tel, info] of tels) {
    const nome = decideNome(pushMap.get(tel), info.nome_form)
    abas[info.aba].push({
      'Nome do Cliente': nome,
      'Contato do Cliente': tel,
    })
  }

  // Gera XLSX
  const wb = XLSX.utils.book_new()
  for (const [aba, linhas] of Object.entries(abas)) {
    const ws = XLSX.utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 38 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, `Aba ${aba}`)
  }

  const out = 'C:/Users/damas/Downloads/clientes_disparo_v3.xlsx'
  XLSX.writeFile(wb, out)

  console.log('\n=== RESUMO ===')
  console.log(`Aba 4882: ${abas['4882'].length} clientes`)
  console.log(`Aba 0824: ${abas['0824'].length} clientes`)
  console.log(`Aba 4169: ${abas['4169'].length} clientes`)
  console.log(`Arquivo:  ${out}`)

  await c.end()
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
