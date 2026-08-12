import { NextRequest, NextResponse } from 'next/server'
import { garantirIndicador } from '@/lib/indicacao'
import { estaNoAr, resolverConsultor } from '@/lib/consultor'
import { avisar, textoNovoIndicador } from '@/lib/whatsapp-avisos'

/** Quem recebe o aviso quando a pessoa pegou o link no site da propria 21Go. */
const DONO_WHATSAPP = '5521992208062'

/**
 * Manda o aviso pra quem e dono do site onde a pessoa pegou o link: o consultor
 * se for site dele, a casa se for o site da 21Go.
 */
async function avisarDonoDoSite(dados: {
  slug: string | null
  nome: string
  whatsapp: string
  link: string
}): Promise<void> {
  let destino = DONO_WHATSAPP
  if (dados.slug) {
    const consultor = await resolverConsultor(dados.slug)
    if (consultor && estaNoAr(consultor)) destino = consultor.whatsapp
  }
  await avisar(destino, textoNovoIndicador(dados))
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Gera (ou devolve) o link de indicacao da pessoa, na hora.
 *
 * Antes isto era uma conversa no WhatsApp com um humano do outro lado. Quem
 * pedia fora do horario comercial simplesmente nao recebia link — e indicacao
 * que nao acontece na hora do impulso nao acontece mais.
 */

function soDigitos(v: string): string {
  return (v || '').replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  let corpo: { nome?: string; whatsapp?: string; consultorSlug?: string | null }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400 })
  }

  const nome = (corpo.nome || '').trim()
  const digitos = soDigitos(corpo.whatsapp || '')

  if (nome.length < 3) {
    return NextResponse.json({ erro: 'me diga seu nome completo' }, { status: 400 })
  }
  if (digitos.length < 10 || digitos.length > 13) {
    return NextResponse.json({ erro: 'WhatsApp incompleto' }, { status: 400 })
  }

  const whatsapp = '55' + digitos.replace(/^55/, '')

  // O slug so entra se parecer slug: ele vem do navegador e vira parte do link
  // que a pessoa vai espalhar.
  const slug =
    corpo.consultorSlug && /^[a-z0-9]{3,40}$/.test(corpo.consultorSlug)
      ? corpo.consultorSlug
      : null

  try {
    const ind = await garantirIndicador({ nome, whatsapp, consultorSlug: slug })

    // O link nasce dentro do site de quem indicou: se a Maria pegou o link no
    // site do Anderson, o amigo dela entra pelo site do Anderson e o lead
    // continua caindo no Power dele. A indicacao nao rouba o lead do consultor.
    const base = slug ? `https://21go.com.br/${slug}` : 'https://21go.com.br'
    const link = `${base}?ind=${ind.codigo}`

    // Avisa o dono do site que entrou gente nova divulgando pra ele. So na
    // primeira vez: quem reabre a pagina pra pegar o proprio link de novo nao
    // pode virar aviso repetido.
    //
    // Fora do await de proposito: quem esta na tela quer o link agora, e nao
    // deve esperar um WhatsApp que nem e pra ele.
    if (ind.novo) {
      void avisarDonoDoSite({ slug, nome: ind.nome, whatsapp: ind.whatsapp, link }).catch((err) =>
        console.error('[indicacao] aviso ao dono falhou:', err),
      )
    }

    return NextResponse.json({
      codigo: ind.codigo,
      nome: ind.nome,
      link,
    })
  } catch (err) {
    console.error('[indicacao]', (err as Error).message)
    return NextResponse.json({ erro: 'não consegui gerar seu link agora' }, { status: 500 })
  }
}
