import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Registra que o cliente clicou em "Quero contratar".
 *
 * Isto era só um Map em memória: sumia a cada deploy e nunca chegou ao banco —
 * `whatsapp_clicado` estava `false` em 994 de 994 leads dos últimos 30 dias,
 * mesmo com gente conversando com a consultora. A coluna existia e mentia.
 *
 * Agora ela é a fonte que o cron de recuperação usa pra saber quem JÁ está
 * conversando. Sem essa gravação, a recuperação mandaria mensagem pra quem
 * acabou de abrir o WhatsApp com a gente — o pior tipo de mensagem possível.
 *
 * O Map continua, mas só serve à consulta imediata do próprio navegador.
 */

const cliquesRecentes = new Map<string, number>()
const DEZ_MINUTOS = 10 * 60 * 1000

function limpar() {
  const agora = Date.now()
  for (const [chave, quando] of cliquesRecentes) {
    if (agora - quando > DEZ_MINUTOS) cliquesRecentes.delete(chave)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { leadId, whatsapp } = (await request.json()) as {
      leadId?: string
      whatsapp?: string
    }
    const identificador = leadId || whatsapp
    if (!identificador) {
      return NextResponse.json(
        { success: false, error: 'leadId or whatsapp required' },
        { status: 400 },
      )
    }

    limpar()
    cliquesRecentes.set(identificador, Date.now())

    if (leadId) {
      const { error } = await supabaseAdmin()
        .from('leads')
        .update({
          whatsapp_clicado: true,
          whatsapp_clicado_em: new Date().toISOString().replace('Z', ''),
        })
        .eq('id', leadId)
      if (error) console.error('[whatsapp-clicked] update falhou:', error.message)
    }

    return NextResponse.json({ success: true, clicked: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[whatsapp-clicked]', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const identificador = new URL(request.url).searchParams.get('id')
  if (!identificador) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }
  limpar()
  return NextResponse.json({ success: true, clicked: cliquesRecentes.has(identificador) })
}
