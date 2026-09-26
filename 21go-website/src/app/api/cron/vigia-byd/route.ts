import { NextRequest, NextResponse } from 'next/server'
import { sql, registrarEvento } from '@/lib/isa/banco'
import { avisarDono } from '@/lib/whatsapp-avisos'
import { getEvolutionInstance } from '@/lib/whatsapp'
import { textoAvisoByd } from '@/lib/vigia-byd.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * BYD que ficou sem mensagem — de 5 em 5 minutos (/opt/vigia-byd-cron.sh).
 *
 * O disparo do BYD (vehicle/lead) roda depois da resposta, e a falha so vai pro log do
 * container, que some no deploy. De 15/09 a 26/09/2026 o 4824 ficou "open" sem passar nada
 * e ~40 BYD nao receberam o PDF sem ninguem saber. Aqui a prova e o que o webhook gravou:
 * se em 15 min nao ha NENHUMA saida do 4824 pro telefone do lead, o dono e avisado.
 * Um aviso por lead (isa_eventos), todos da rodada numa mensagem so.
 */

const DONO = '5521992208062'

interface Linha {
  id: string
  nome: string | null
  telefone: string
  modelo_interesse: string | null
  ano_interesse: number | null
  cotacao_plano: string | null
  cotacao_valor: string | number | null
  created_at: string
  whatsapp_clicado: boolean | null
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    const instancia = getEvolutionInstance()
    // O casamento e pelos 8 ultimos digitos: o 9 do celular diverge entre formulario e WhatsApp.
    const leads = await sql<Linha>(
      `SELECT l.id, l.nome, coalesce(l.whatsapp, l.telefone) AS telefone, l.modelo_interesse,
              l.ano_interesse, l.cotacao_plano, l.cotacao_valor, l.created_at::text, l.whatsapp_clicado
         FROM public.leads l
        WHERE l.marca_interesse ILIKE 'BYD%' AND l.consultor_slug IS NULL AND l.dominio IS NOT NULL
          AND coalesce(l.status, '') <> 'excluido'
          AND l.created_at BETWEEN now() - interval '6 hours' AND now() - interval '15 minutes'
          AND NOT EXISTS (
                SELECT 1 FROM public.messages m
                 WHERE m.evolution_instance = $1 AND m.direction = 'outbound'
                   AND m.created_at > now() - interval '7 hours' AND m.created_at >= l.created_at
                   AND right(split_part(m.jid, '@', 1), 8) =
                       right(regexp_replace(coalesce(l.whatsapp, l.telefone, ''), '\\D', '', 'g'), 8))
          AND NOT EXISTS (
                SELECT 1 FROM public.isa_eventos e
                 WHERE e.tipo = 'vigia_byd_sem_envio' AND e.detalhe->>'lead_id' = l.id)
        ORDER BY l.created_at
        LIMIT 20`,
      [instancia],
    )
    if (leads.length === 0) return NextResponse.json({ ok: true, avisados: 0 })

    const [ultima] = await sql<{ max: string | null }>(
      `SELECT max(created_at)::text AS max FROM public.messages
        WHERE evolution_instance = $1 AND created_at > now() - interval '2 days'`,
      [instancia],
    )
    // leads e messages gravam em UTC sem fuso: o 'Z' evita ler como hora local.
    const utc = (s: string) => new Date(`${s.replace(' ', 'T')}Z`)
    const texto = textoAvisoByd(
      leads.map((l) => ({
        nome: l.nome,
        telefone: l.telefone,
        modelo: l.modelo_interesse,
        ano: l.ano_interesse,
        plano: l.cotacao_plano,
        valor: l.cotacao_valor == null ? null : Number(l.cotacao_valor),
        criadoEm: utc(l.created_at),
        clicouWhatsapp: !!l.whatsapp_clicado,
      })),
      ultima?.max ? utc(ultima.max) : null,
    )

    const enviado = await avisarDono(DONO, texto)
    // Sem aviso entregue, nao marca: a proxima rodada tenta de novo.
    if (enviado) {
      for (const l of leads) {
        await registrarEvento(l.telefone, 'vigia_byd_sem_envio', { lead_id: l.id }, 'vigia')
      }
    }
    return NextResponse.json({ ok: true, avisados: enviado ? leads.length : 0, pendentes: leads.map((l) => l.id) })
  } catch (err) {
    console.error('[vigia-byd] falhou:', err)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
