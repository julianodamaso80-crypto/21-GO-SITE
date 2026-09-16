import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento, type ContatoIsa } from '@/lib/isa/banco'
import { enviarTemplate, EnvioBloqueado } from '@/lib/isa/cloud'
import { leadDoCliente } from '@/lib/isa/fatos'
import { TEMPLATE_RETOMADA, variaveisDoTemplate, textoDaRetomada } from '@/lib/isa/abordagem.regras'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE = 'https://21go.site'

/**
 * Janela de 24 h fechada: a Meta so aceita template, e a caixa de resposta ficava morta. Dono,
 * 16/09/2026: "alguns clientes tipo rafael nao consigo responder, ta inclicavel onde responde,
 * isso nao pode acontecer nunca, eu sempre tenho que conseguir responder todos".
 *
 * Manda o `duvida_valores_isa` (UTILITY, ja aprovado, o mesmo da retomada dos 10 min) com o nome,
 * o veiculo e o PDF do cliente. Quando ele responder, a janela reabre e a caixa volta a escrever
 * livre. Em 16/09/2026 os 62 contatos com janela fechada tinham simulacao, entao o template serve
 * pra todos; quem nao tiver recebe o motivo em vez de um template torto.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  if (!telefone) return NextResponse.json({ erro: 'telefone' }, { status: 400 })

  const [c] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!c) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  if (c.janela_ate && new Date(c.janela_ate).getTime() > Date.now()) {
    return NextResponse.json({ erro: 'a janela ainda está aberta: é só escrever normalmente' }, { status: 409 })
  }

  const lead = await leadDoCliente(telefone, c.lead_id, null).catch(() => null)
  const nv = lead
    ? variaveisDoTemplate({ nome: lead.nome ?? c.nome, marca: lead.marca_interesse, modelo: lead.modelo_interesse, ano: lead.ano_interesse })
    : null
  if (!lead || !nv) {
    return NextResponse.json(
      { erro: 'esse cliente não tem simulação com nome e veículo, e a mensagem aprovada da Meta precisa dos dois' },
      { status: 422 },
    )
  }
  const vars: [string, string, string] = [...nv, `${SITE}/api/pdfs/${lead.id}`]

  try {
    const wamid = await enviarTemplate(telefone, TEMPLATE_RETOMADA, vars)
    if (c.conversation_id) {
      await upsertMessage({
        conversation_id: c.conversation_id,
        whatsapp_message_id: wamid,
        evolution_instance: 'cloud_isa',
        jid: phoneToJid(telefone) ?? `${telefone}@s.whatsapp.net`,
        direction: 'outbound',
        status: 'SENT',
        sender: s.u,
        message_type: 'text',
        content: textoDaRetomada(vars),
        sent_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    if (err instanceof EnvioBloqueado) {
      return NextResponse.json({ erro: 'modo teste: a Isa só fala com os números liberados' }, { status: 403 })
    }
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'falha ao enviar' }, { status: 502 })
  }

  await registrarEvento(telefone, 'reabriu_com_template', { template: TEMPLATE_RETOMADA }, s.u)
  return NextResponse.json({ ok: true, texto: textoDaRetomada(vars) })
}
