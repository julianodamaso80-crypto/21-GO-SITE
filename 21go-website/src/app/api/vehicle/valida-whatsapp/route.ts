import { NextRequest, NextResponse } from 'next/server'
import { validarFormatoWhatsApp, apenasDigitosNacionais } from '@/lib/whatsapp-numero'
import { numeroExisteNoWhatsApp } from '@/lib/whatsapp-existe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A barreira do formulário: o número existe no WhatsApp?
 *
 * Chamada no submit da cotação, um número por vez. Devolve `bloqueia: true`
 * só quando o WhatsApp respondeu explicitamente que o número não existe —
 * qualquer outra coisa (Evolution fora, timeout, resposta estranha) deixa o
 * cliente seguir. Perder lead por indisponibilidade nossa seria pior que o
 * problema que isto resolve.
 *
 * ─── Por que tem limite por IP ───────────────────────────────────────────────
 * É um endpoint público que pergunta ao WhatsApp se um número existe. Sem
 * limite, vira validador de base de terceiro rodando pelo nosso chip — e quem
 * paga a conta do banimento somos nós.
 */

const LIMITE_POR_IP = 12
const JANELA_MS = 60 * 60 * 1000
const usoPorIp = new Map<string, number[]>()

function excedeuLimite(ip: string): boolean {
  const agora = Date.now()
  const anteriores = (usoPorIp.get(ip) || []).filter((t) => agora - t < JANELA_MS)
  anteriores.push(agora)
  usoPorIp.set(ip, anteriores)
  if (usoPorIp.size > 5000) usoPorIp.clear() // teto de memória, sem cerimônia
  return anteriores.length > LIMITE_POR_IP
}

export async function POST(req: NextRequest) {
  try {
    const { whatsapp } = (await req.json()) as { whatsapp?: string }
    if (!whatsapp) {
      return NextResponse.json({ erro: 'whatsapp obrigatório' }, { status: 400 })
    }

    const erroFormato = validarFormatoWhatsApp(whatsapp)
    if (erroFormato) {
      return NextResponse.json({ bloqueia: true, motivo: 'formato', erro: erroFormato })
    }

    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'desconhecido'
    if (excedeuLimite(ip)) {
      return NextResponse.json({ bloqueia: false, motivo: 'limite_ip' })
    }

    const telefone = `55${apenasDigitosNacionais(whatsapp)}`
    const existe = await numeroExisteNoWhatsApp(telefone)

    if (existe === 'nao_existe') {
      return NextResponse.json({
        bloqueia: true,
        motivo: 'sem_whatsapp',
        erro: 'Esse número não tem WhatsApp. Confere pra gente?',
      })
    }

    return NextResponse.json({ bloqueia: false, motivo: existe })
  } catch (err) {
    console.error('[valida-whatsapp]', err instanceof Error ? err.message : err)
    return NextResponse.json({ bloqueia: false, motivo: 'erro' })
  }
}
