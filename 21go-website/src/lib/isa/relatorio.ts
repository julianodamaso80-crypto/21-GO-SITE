import 'server-only'
import { sql } from '@/lib/isa/banco'
import { lerConfig, gravarConfig } from '@/lib/isa/abordagem'
import { alertarDono } from '@/lib/isa/alertas'
import { enviarTexto, numeroDeAlerta } from '@/lib/isa/cloud'
import { diaNoRio, horaNoRio } from '@/lib/isa/hora.regras'
import { DOMINIOS_DA_CASA } from '@/lib/isa/popup.regras'

/**
 * Relatorio diario da Isa pro dono (auditoria de 12/09/2026): o que aconteceu ONTEM e, o mais
 * importante, o que ela NAO soube responder — e dai que o gabarito cresce, toda semana, do dado
 * real. Sai uma vez por dia, a partir das 8h do Rio, pelo cron de 1 em 1 minuto.
 */

interface Numeros {
  conversas: number
  novos: number
  simulacoes: number
  escolheram: number
  documentos: number
  nao_soube: number
  pendentes: number
}

export async function relatorioDiario(): Promise<{ enviado: boolean; motivo?: string }> {
  const agora = new Date()
  if (horaNoRio(agora) < 8) return { enviado: false, motivo: 'cedo' }
  const hoje = diaNoRio(agora)
  const cfg = await lerConfig<{ dia?: string }>('relatorio')
  if (cfg?.dia === hoje) return { enviado: false, motivo: 'ja_enviado' }
  // Reivindica o dia antes de montar: dois crons nunca mandam dois relatorios.
  await gravarConfig('relatorio', { dia: hoje })

  // Ontem, no Rio: meia-noite de ontem ate meia-noite de hoje, em UTC (+3 h).
  const [n] = await sql<Numeros>(
    `WITH janela AS (
       SELECT ($1::date::timestamp + interval '3 hours') - interval '1 day' AS de,
              ($1::date::timestamp + interval '3 hours') AS ate
     )
     SELECT
       (SELECT count(DISTINCT m.conversation_id) FROM public.messages m, janela
          WHERE m.evolution_instance = 'cloud_isa' AND m.direction = 'inbound' AND m.created_at >= janela.de AND m.created_at < janela.ate)::int AS conversas,
       (SELECT count(*) FROM public.isa_contatos c, janela WHERE c.created_at >= janela.de AND c.created_at < janela.ate)::int AS novos,
       (SELECT count(*) FROM public.isa_eventos e, janela
          WHERE e.tipo = 'orcamento' AND e.detalhe->>'resultado' = 'ok' AND e.created_at >= janela.de AND e.created_at < janela.ate)::int AS simulacoes,
       (SELECT count(DISTINCT e.telefone) FROM public.isa_eventos e, janela
          WHERE e.tipo = 'pediu_documentos' AND e.created_at >= janela.de AND e.created_at < janela.ate)::int AS escolheram,
       (SELECT count(DISTINCT e.telefone) FROM public.isa_eventos e, janela
          WHERE e.tipo = 'transferiu' AND e.detalhe->>'motivo' = 'documento' AND e.created_at >= janela.de AND e.created_at < janela.ate)::int AS documentos,
       (SELECT count(*) FROM public.isa_eventos e, janela
          WHERE e.tipo = 'sem_informacao' AND e.created_at >= janela.de AND e.created_at < janela.ate)::int AS nao_soube,
       (SELECT count(*) FROM public.isa_contatos c WHERE c.pergunta_pendente IS NOT NULL)::int AS pendentes`,
    [hoje],
  )
  const perguntas = await sql<{ pergunta: string }>(
    `SELECT e.detalhe->>'pergunta' AS pergunta FROM public.isa_eventos e
     WHERE e.tipo = 'sem_informacao'
       AND e.created_at >= ($1::date::timestamp + interval '3 hours') - interval '1 day'
       AND e.created_at <  ($1::date::timestamp + interval '3 hours')
     ORDER BY e.created_at DESC LIMIT 8`,
    [hoje],
  )

  // Cobertura (dono, 14/09/2026): todo lead dos .site que nao clicou em "Quero contratar" tem que cair na
  // Isa — as unicas excecoes sao contato errado, veiculo que nao fazemos e placa presa com outro
  // consultor. Quem sobra fora disso e falha nossa e aparece aqui com ⚠️.
  const cobertura = await coberturaDaIsa()

  const [ano, mes, dia] = hoje.split('-').map(Number)
  const ontem = new Date(Date.UTC(ano, mes - 1, dia - 1))
  const rotulo = `${String(ontem.getUTCDate()).padStart(2, '0')}/${String(ontem.getUTCMonth() + 1).padStart(2, '0')}`
  const linhas = [
    `📊 Isa ontem (${rotulo})`,
    `conversas: ${n.conversas} (${n.novos} novas)`,
    `simulações: ${n.simulacoes}`,
    `escolheram plano: ${n.escolheram}`,
    `mandaram documento: ${n.documentos}`,
    `não soube responder: ${n.nao_soube}${n.pendentes ? ` (${n.pendentes} ainda sem resposta)` : ''}`,
  ]
  linhas.push('', `cobertura (24 h, leads dos .site sem clique no Quero contratar): ${cobertura.total}`)
  for (const c of cobertura.itens) linhas.push(`${c.situacao.startsWith('⚠️') ? '' : '• '}${c.situacao}: ${c.n}`)
  if (perguntas.length) {
    linhas.push('', 'o que ela não soube:')
    for (const p of perguntas) if (p.pergunta) linhas.push(`• ${p.pergunta.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  const para = numeroDeAlerta()
  if (!para) return { enviado: false, motivo: 'sem_numero' }
  // Texto limpo dentro da janela; se ela fechou, o alerta comum (template) leva o mesmo conteudo.
  try {
    await enviarTexto(para, linhas.join('\n'))
  } catch {
    await alertarDono({ telefone: para, nome: 'Isa', motivo: 'relatorio', detalhe: linhas.join('\n') })
  }
  return { enviado: true }
}

interface LinhaCobertura {
  situacao: string
  n: number
}

/**
 * Leads das ultimas 24 h dos .site, sem clique em "Quero contratar", classificados: na Isa, ou o
 * motivo de nao estar. "⚠️ sem motivo" = deveria estar e nao esta (o que o dono viu no Power).
 */
export async function coberturaDaIsa(): Promise<{ total: number; itens: LinhaCobertura[] }> {
  const casa = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
  const itens = await sql<LinhaCobertura & { n: string }>(
    `WITH l AS (
       SELECT l.*, (c.telefone IS NOT NULL) AS na_isa
       FROM public.leads l
       LEFT JOIN public.isa_contatos c
         ON c.telefone = l.telefone OR c.telefone = substr(l.telefone, 1, 4) || '9' || substr(l.telefone, 5)
       WHERE l.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'
         AND l.created_at < (now() AT TIME ZONE 'UTC') - interval '6 minutes'
         AND l.consultor_slug IS NULL
         AND l.dominio = ANY($1::text[])
         AND COALESCE(l.whatsapp_clicado, false) = false
     )
     SELECT CASE
         WHEN na_isa THEN 'na Isa'
         WHEN COALESCE(whatsapp_valido, true) = false THEN 'contato errado'
         WHEN status = 'excluido' OR etapa_funil = 'excluido' OR cotacao_planos IS NULL THEN 'veículo que não fazemos'
         WHEN power_responsavel IS NOT NULL AND power_responsavel <> $2 THEN 'placa presa com outro consultor'
         ELSE '⚠️ sem motivo — deveria estar na Isa'
       END AS situacao, count(*)::text AS n
     FROM l GROUP BY 1 ORDER BY 2 DESC`,
    [DOMINIOS_DA_CASA, casa],
  )
  const lista = itens.map((i) => ({ situacao: i.situacao, n: Number(i.n) }))
  return { total: lista.reduce((a, b) => a + b.n, 0), itens: lista }
}
