import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import {
  configurado,
  desconectar,
  estadoDaConexao,
  gerarQrCode,
  marcarConectado,
  lerEnvioAoCliente,
  definirEnvioAoCliente,
} from '@/lib/painel/whatsapp-proprio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Só o dono conecta o próprio WhatsApp — divulgador não mexe no chip dele. */

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    if (!configurado()) return NextResponse.json({ estado: 'indisponivel' })

    const { estado, numero } = await estadoDaConexao(sessao.slug)
    const enviarAoCliente = await lerEnvioAoCliente(sessao.slug)
    // Assim que conecta, guardamos o número — é o que a tela mostra depois.
    if (estado === 'conectado' && !numero) {
      const achado = await marcarConectado(sessao.slug)
      return NextResponse.json({ estado, numero: achado, enviarAoCliente })
    }
    return NextResponse.json({ estado, numero, enviarAoCliente })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/whatsapp GET]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    if (!configurado())
      return NextResponse.json({ erro: 'Conexão indisponível agora.' }, { status: 503 })

    const { qr, estado } = await gerarQrCode(sessao.slug)
    if (!qr && estado !== 'conectado')
      return NextResponse.json({ erro: 'Não deu pra gerar o QR agora.' }, { status: 502 })

    return NextResponse.json({ qr, estado })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/whatsapp POST]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const b = (await req.json().catch(() => ({}))) as { enviarAoCliente?: boolean }
    await definirEnvioAoCliente(sessao.slug, Boolean(b.enviarAoCliente))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/whatsapp PATCH]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    await desconectar(sessao.slug)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/whatsapp DELETE]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
