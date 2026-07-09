import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '21 go 0741'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const NOTIFY_NUMBER = process.env.NOTIFY_NUMBER || '5521969620781'

export async function POST(request: NextRequest) {
  try {
    if (!EVOLUTION_API_KEY) {
      return NextResponse.json({ success: false, error: 'Evolution API not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { nome, whatsapp, placa, veiculo, plano, valor, leilao, carroApp, seguroAtual } = body

    if (!nome || !whatsapp) {
      return NextResponse.json({ success: false, error: 'nome and whatsapp required' }, { status: 400 })
    }

    const origemLabel =
      leilao === 'leilao' ? 'Leil\u{E3}o' : leilao === 'remarcado' ? 'Remarcado' : 'N\u{E3}o'
    const carroAppLabel = carroApp ? 'Sim (Uber/99)' : 'N\u{E3}o'
    const seguroLabel = seguroAtual?.trim() ? seguroAtual.trim() : 'N\u{E3}o'

    const message = [
      `\u{1F6A8} LEAD ABANDONADO - 21Go!`,
      ``,
      `Cliente preencheu cota\u{E7}\u{E3}o mas N\u{C3}O chamou no WhatsApp:`,
      ``,
      `Nome: ${nome}`,
      `WhatsApp: ${whatsapp}`,
      `Placa: ${placa || 'N/A'}`,
      `Ve\u{ED}culo: ${veiculo || 'N/A'}`,
      `Plano: ${plano || 'N/A'}`,
      `Valor: ${valor || 'N/A'}/m\u{EA}s`,
      `Origem: ${origemLabel}`,
      `Carro de app: ${carroAppLabel}`,
      `Seguro/prote\u{E7}\u{E3}o atual: ${seguroLabel}`,
      ``,
      `\u{23F0} J\u{E1} se passaram 5 minutos sem contato.`,
      `Entre em contato AGORA pra recuperar essa venda!`,
    ].join('\n')

    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: NOTIFY_NUMBER, text: message }),
      },
    )

    const result = await response.json()

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error('[LeadAbandoned API]', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
