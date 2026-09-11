import { NextRequest, NextResponse } from 'next/server'
import { pensar } from '@/lib/isa/cerebro'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import type { MensagemHistorico } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Simulador da Isa — testa o cerebro sem mandar nada pra ninguem e sem gravar nada.
 * Protegido pelo CRON_SECRET. Serve pra conferir cota, SUSEP, desconto, genero... a qualquer
 * hora, antes de a Isa falar com cliente de verdade.
 *
 * POST { mensagens: [{ de: 'cliente'|'isa', texto }], telefone?, leadId?, nome?, genero?, hora? }
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as {
    mensagens?: { de: string; texto: string }[]
    telefone?: string
    leadId?: string
    nome?: string
    genero?: 'm' | 'f' | null
    hora?: string
    desconto50?: { de: number; para: number } | null
  }
  const lead = b.telefone || b.leadId ? await leadDoCliente(b.telefone ?? '', b.leadId ?? null) : null
  const fatos = lead ? fatosDoLead(lead, b.desconto50 ?? null) : null
  const historico: MensagemHistorico[] = (b.mensagens || []).map((m, i) => ({
    id: String(i),
    whatsapp_message_id: String(i),
    direction: m.de === 'cliente' ? 'inbound' : 'outbound',
    sender: m.de === 'cliente' ? 'contact' : 'isa',
    message_type: 'text',
    content: m.texto,
    raw_payload: null,
    criada_em: '',
  }))
  const inicio = Date.now()
  const saida = await pensar({
    nome: b.nome ?? lead?.nome ?? null,
    genero: b.genero ?? null,
    fatos,
    jaGanhouDesconto: !!b.desconto50,
    historico,
    agora: b.hora ? new Date(b.hora) : new Date(),
    cumprimentar: (b.mensagens || []).every((m) => m.de === 'cliente'),
  })
  return NextResponse.json({
    ms: Date.now() - inicio,
    lead: lead ? { id: lead.id, veiculo: `${lead.marca_interesse} ${lead.modelo_interesse} ${lead.ano_interesse}` } : null,
    fatos: fatos ? { cota: fatos.cotaPct, ativacao: fatos.ativacaoReferencia, planos: fatos.planos.map((p) => `${p.nome} ${p.mensal}`) } : null,
    saida,
  })
}
