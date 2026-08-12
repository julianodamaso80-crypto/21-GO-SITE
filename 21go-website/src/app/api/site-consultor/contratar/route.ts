import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esquecerConsultor } from '@/lib/consultor'
import { ROTAS_RESERVADAS } from '@/lib/rotas-reservadas'
import { buscarConsultorNoPower, mesmoTelefone, soDigitos } from '@/lib/power-consultor'
import { garantirCliente, garantirAssinatura, linkDaPrimeiraCobranca } from '@/lib/asaas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Passo 2: contrata o site.
 *
 * A regra que este arquivo existe pra cumprir: **o lead tem que cair no Power
 * de quem vendeu**. Errar isso e pior do que nao vender — o consultor paga R$ 80
 * por mes, faz trafego pago do proprio bolso e os leads dele nascem no nome de
 * outra pessoa. Por isso o PowerLink NUNCA vem do formulario: vem do Power, na
 * hora, buscado pelo e-mail, e o telefone digitado tem que bater com o que o
 * Power ja tem cadastrado.
 *
 * O telefone e a prova de identidade. Nao o nome: o Power tem cadastro como
 * "CARLOS A R JUNIOR", e exigir que a pessoa acerte essa grafia recusaria gente
 * legitima. Telefone e objetivo e so o dono sabe o proprio.
 */

const FORMATO_SLUG = /^[a-z0-9]{3,30}$/

export async function POST(req: NextRequest) {
  let corpo: { email?: string; telefone?: string; cpf?: string; slug?: string }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400 })
  }

  const email = (corpo.email || '').trim().toLowerCase()
  const telefone = (corpo.telefone || '').trim()
  const cpf = soDigitos(corpo.cpf || '')
  const slug = (corpo.slug || '').trim().toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'e-mail inválido' }, { status: 400 })
  }
  if (soDigitos(telefone).length < 10) {
    return NextResponse.json({ erro: 'WhatsApp incompleto' }, { status: 400 })
  }
  if (cpf.length !== 11) {
    return NextResponse.json({ erro: 'CPF precisa ter 11 dígitos' }, { status: 400 })
  }
  if (!FORMATO_SLUG.test(slug)) {
    return NextResponse.json(
      { erro: 'o endereço só aceita letras e números, de 3 a 30 caracteres' },
      { status: 400 },
    )
  }
  if (ROTAS_RESERVADAS.has(slug)) {
    return NextResponse.json({ erro: 'esse endereço é do site, escolha outro' }, { status: 400 })
  }

  // ─── A conferencia que impede o lead de cair no consultor errado ───────────
  let noPower
  try {
    noPower = await buscarConsultorNoPower(email)
  } catch {
    return NextResponse.json(
      { erro: 'não consegui falar com o Power agora. Tente de novo em instantes.' },
      { status: 503 },
    )
  }

  if (!noPower) {
    return NextResponse.json(
      { erro: 'esse e-mail não tem PowerLink no Power. Fale com a 21Go antes de contratar.' },
      { status: 404 },
    )
  }
  if (!mesmoTelefone(telefone, noPower.telefone)) {
    // Nao diz qual e o telefone certo — isso entregaria o dado pra quem esta
    // tentando contratar no nome de outro.
    return NextResponse.json(
      { erro: 'esse WhatsApp não é o que está cadastrado no seu Power.' },
      { status: 403 },
    )
  }

  const supa = supabaseAdmin()

  // Ja contratou? Devolve o que existe em vez de criar uma segunda assinatura.
  const { data: existente } = await supa
    .from('sites_consultor')
    .select('slug, status, asaas_subscription_id')
    .ilike('email', noPower.email)
    .maybeSingle()

  if (existente && existente.status !== 'cancelado') {
    const link = existente.asaas_subscription_id
      ? await linkDaPrimeiraCobranca(existente.asaas_subscription_id).catch(() => null)
      : null
    return NextResponse.json({
      jaTemSite: true,
      slug: existente.slug,
      status: existente.status,
      linkPagamento: link,
    })
  }

  const whatsapp = '55' + soDigitos(telefone).replace(/^55/, '')

  // ─── Cobranca ──────────────────────────────────────────────────────────────
  let assinaturaId: string
  let vencimento: string
  let linkPagamento: string | null = null
  try {
    const cliente = await garantirCliente({
      slug,
      nome: noPower.nome,
      cpf,
      email: noPower.email,
      whatsapp,
    })
    const assinatura = await garantirAssinatura(cliente.id, slug)
    assinaturaId = assinatura.id
    vencimento = assinatura.nextDueDate
    linkPagamento = await linkDaPrimeiraCobranca(assinatura.id).catch(() => null)

    // ─── So grava depois que a cobranca existe ───────────────────────────────
    // Se gravasse antes, uma falha no Asaas deixaria um site "pendente" sem
    // assinatura nenhuma — e o slug ocupado pra sempre por quem nunca pagou.
    const { error } = await supa.from('sites_consultor').insert({
      id: randomUUID(),
      slug,
      nome: noPower.nome,
      email: noPower.email,
      whatsapp,
      powerlink_id: noPower.powerlinkId,
      power_nome: noPower.nome,
      asaas_customer_id: cliente.id,
      asaas_subscription_id: assinatura.id,
      status: 'pendente',
      proximo_vencimento: assinatura.nextDueDate,
    })

    if (error) {
      // 23505 = alguem pegou o slug entre a checagem e o insert.
      if (error.code === '23505') {
        return NextResponse.json(
          { erro: 'esse endereço acabou de ser reservado. Escolha outro.' },
          { status: 409 },
        )
      }
      throw new Error(error.message)
    }
  } catch (err) {
    const msg = (err as Error).message
    console.error('[contratar]', email, slug, msg)
    return NextResponse.json({ erro: msg }, { status: 502 })
  }

  esquecerConsultor(slug)
  console.log(`[contratar] ${noPower.nome} -> /${slug} (assinatura ${assinaturaId})`)

  return NextResponse.json({
    ok: true,
    slug,
    nome: noPower.nome,
    vencimento,
    linkPagamento,
    url: `https://21go.com.br/${slug}`,
  })
}
