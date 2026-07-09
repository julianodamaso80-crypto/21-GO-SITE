import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '21 go 0741'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const CRM_API = process.env.NEXT_PUBLIC_API_URL || 'https://crm-21-go-production.up.railway.app'

function buildMessage(data: {
  nome: string
  veiculo: string
  placa: string
  valor: string
  plano: string
  tipo: string
}): string {
  const firstName = data.nome.split(' ')[0]
  const isMoto = data.tipo === 'moto'
  const artigo = isMoto ? 'a' : 'o'

  const lines = [
    `Oi *${firstName}*! Tudo bem? 😊`,
    ``,
    `Recebi aqui sua simulação d${artigo} *${data.veiculo}*${data.placa ? ` — placa *${data.placa}*` : ''}.`,
    ``,
  ]

  if (data.valor) {
    lines.push(`Ficou em *${data.valor}/mês* pra proteger ${isMoto ? 'ela' : 'ele'} com o plano *${data.plano}*.`)
    lines.push(``)
  }

  lines.push(
    `Com a *21Go* ${artigo} ${data.tipo} fica segur${artigo} *a partir de agora*. E o valor que apareceu ali? *Não muda, não sobe, sem surpresa*.`,
    ``,
    `Vamos proteger su${artigo} ${data.tipo} hoje? Me responde aqui que *eu resolvo pra você agora*, rapidinho 🚀`,
  )

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    if (!EVOLUTION_API_KEY) {
      return NextResponse.json({ success: false, error: 'Evolution API not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { nome, whatsapp, veiculo, placa, valor, plano, tipo } = body

    if (!nome || !whatsapp) {
      return NextResponse.json({ success: false, error: 'nome and whatsapp required' }, { status: 400 })
    }

    // Formatar número
    const rawPhone = whatsapp.replace(/\D/g, '')
    const phone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`

    const message = buildMessage({ nome, veiculo, placa, valor, plano, tipo })

    // Enviar via Evolution API
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: phone, text: message }),
      },
    )

    const result = await response.json()

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error('[FollowUp API]', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
