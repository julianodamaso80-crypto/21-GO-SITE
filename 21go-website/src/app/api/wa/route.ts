import { NextRequest, NextResponse } from 'next/server'
import { pickWhatsAppTarget } from '@/lib/whatsapp-rotation'
import { estaNoAr, resolverConsultor } from '@/lib/consultor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Redireciona o cliente pro WhatsApp aplicando o rodízio 2:1:1 e o failover (ver
 * whatsapp-rotation.ts). Todo link de contato do site aponta pra cá em vez de
 * apontar pro wa.me direto — é o que garante que os contatos se dividam entre
 * os três chips e que ninguém seja mandado pra um número derrubado.
 *
 * Só roda quando o cliente CLICA. O site não dispara mais mensagem sozinho
 * depois da cotação (decisão do dono, 2026-07-29) — contato frio automático era
 * o que vinha derrubando os números.
 *
 * Num site de consultor (`?c=<slug>`) o rodizio nao se aplica: o cliente fala
 * direto com o consultor, no numero que ele cadastrou. E de graca e nao tem
 * risco de ban — e um link, nao um disparo.
 *
 * GET /api/wa?text=<mensagem opcional ja decodificada>&c=<slug do consultor>
 */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')
  const slug = req.nextUrl.searchParams.get('c')

  // Trava de segurança (07/08/2026): clique vindo de dentro do site SEM
  // mensagem montada significa link solto de CTA — exatamente o que enchia os
  // chips de contato anônimo. Esse caso vai pra cotação: o cliente preenche o
  // formulário e aí sim a conversa abre, já identificada.
  //
  // Link colado no PDF/WhatsApp (sem Referer nosso) continua abrindo direto —
  // ali do outro lado já tem um lead que preencheu tudo.
  const referer = req.headers.get('referer') || ''
  const doProprioSite = /^https?:\/\/(www\.)?(21go\.site|21go\.com\.br|21goconsultoraleticya\.site|localhost)/i.test(referer)
  if (!text && doProprioSite) {
    console.warn(`[wa] link sem contexto vindo de ${referer} — mandando pra cotação`)
    // Location relativo de propósito: atrás do proxy o origin interno é
    // 0.0.0.0:3000 e um redirect absoluto mandaria o cliente pro nada.
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: '/cotacao',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  }

  // Site de consultor: o contato é dele, não da casa. Se o slug não existir ou
  // o site estiver cancelado, cai no rodízio normal — o cliente não pode ficar
  // sem atendimento por causa de um link velho.
  let numero: string
  let rotulo: string

  const consultor = slug ? await resolverConsultor(slug) : null
  if (consultor && estaNoAr(consultor)) {
    numero = consultor.whatsapp
    rotulo = `consultor ${consultor.slug}`
  } else {
    if (slug) console.warn(`[wa] slug "${slug}" sem site ativo — caindo no rodízio`)
    const target = await pickWhatsAppTarget()
    numero = target.number
    rotulo = target.instance
  }

  // Monta a query na mão: URLSearchParams codifica espaço como "+" (formato de
  // formulário) e o WhatsApp mostra o "+" literal na mensagem pré-preenchida.
  const url = text
    ? `https://wa.me/${numero}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${numero}`

  console.log(`[wa] -> ${numero} (${rotulo})`)

  // 302: o clique não deve ficar em cache do navegador nem de CDN, senão o
  // rodízio congela no primeiro número sorteado.
  const res = NextResponse.redirect(url, 302)
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return res
}
