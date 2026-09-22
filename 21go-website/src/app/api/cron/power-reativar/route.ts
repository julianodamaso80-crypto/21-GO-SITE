import { NextRequest, NextResponse } from 'next/server'
import { painel } from '@/lib/power-pipeline'
import { MAX_REATIVACOES, candidatoAReativar, vezesReativada, type ItemDoFunil } from '@/lib/power-reativar.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reativa a simulacao expirada dos clientes da Leticya — 1x por dia (/opt/power-reativar-cron.sh).
 * Regras em `power-reativar.regras.ts`: expirou, reativa; no maximo 2 vezes na vida do card;
 * so colunas 1 e 2; so clientes de setembro/2026 em diante. Feito com a sessao DELA: o
 * historico grava "Leticya reativou essa Simulacao por mais 7 dias".
 *
 * A listagem do funil ja traz `quotationExpire`, entao so abre o card de quem expirou.
 */

const TETO_POR_RODADA = 300

interface ItemListagem extends ItemDoFunil {
  code?: string
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const relatorio = { lidos: 0, expirados: 0, reativados: 0, ja_no_limite: 0, recusados: 0, erros: 0 }
  const candidatos: ItemListagem[] = []

  try {
    for (const coluna of [1, 2]) {
      for (let bloco = 1; bloco <= 1000; bloco++) {
        const r = (await painel('/internal/pipeline/fetchNegotiations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: coluna, blocks: bloco }),
        })) as { itens?: ItemListagem[] } | null
        const itens = r?.itens ?? []
        relatorio.lidos += itens.length
        candidatos.push(...itens.filter(candidatoAReativar))
        if (itens.length < 20) break
      }
    }
  } catch (err) {
    console.error('[power-reativar] listagem', err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: 'listagem falhou', ...relatorio }, { status: 502 })
  }
  relatorio.expirados = candidatos.length

  for (const item of candidatos.slice(0, TETO_POR_RODADA)) {
    try {
      const neg = (await painel(`/company/fetchNegotiationCard?code=${encodeURIComponent(item.code ?? '')}`)) as {
        quotations?: { quotationId?: number; active?: boolean; shelved?: boolean }[]
      }
      const ativas = (neg?.quotations ?? []).filter((q) => q.active !== false && q.shelved !== true && q.quotationId)
      if (ativas.length !== 1) continue // frota: fica para a mao de quem atende
      const quotationId = ativas[0].quotationId!
      const cot = (await painel(`/company/fetchQuotationCard?cardId=${quotationId}`)) as {
        code?: string
        quotationExpired?: boolean
      }
      if (!cot?.quotationExpired || !cot.code) continue
      const hist = (await painel(`/internal/history/find/${encodeURIComponent(cot.code)}`)) as { message?: string }[]
      if (vezesReativada(hist) >= MAX_REATIVACOES) {
        relatorio.ja_no_limite++
        continue
      }
      const r = (await painel('/company/renewQuotation', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ quotationId: String(quotationId), changeProtectValue: 'false' }).toString(),
      })) as { id?: number; plates?: string | null } | null
      if (Number(r?.id) === 1) relatorio.reativados++
      else {
        // id 0 com placa = a mesma placa esta em outro card ha menos de 7 dias; o Power recusa.
        relatorio.recusados++
        console.warn('[power-reativar] recusado', item.code, r?.plates ?? '')
      }
    } catch (err) {
      relatorio.erros++
      console.error('[power-reativar]', item.code, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json(relatorio)
}
