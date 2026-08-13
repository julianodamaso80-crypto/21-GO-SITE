import { NextRequest, NextResponse } from 'next/server'
import { estaNoAr, resolverConsultor } from '@/lib/consultor'

export const runtime = 'nodejs'

/**
 * Quem e o dono deste site — o que o navegador precisa saber pra montar os
 * botoes de contato: o nome e o WhatsApp DELE.
 *
 * Publico de proposito, e por isso devolve so estes tres campos. O `powerlink_id`
 * NAO sai daqui: com ele qualquer um conseguiria carimbar cotacao no nome de um
 * consultor de fora do site dele. Quem usa o powerlink e o servidor, no
 * `/api/vehicle/lead`, onde o slug chega junto do formulario.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)

  if (!consultor || !estaNoAr(consultor)) {
    return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })
  }

  return NextResponse.json(
    {
      slug: consultor.slug,
      nome: consultor.nome,
      whatsapp: consultor.whatsapp,
      ocultarAtivacao: consultor.ocultarAtivacao,
    },
    // O dado quase nunca muda e a pagina inteira depende dele pra montar o
    // botao de contato. 5 min bate com o TTL do cache do servidor.
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
  )
}
