import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { abrirConversa } from '@/lib/isa/painel-dados'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const t = (req.nextUrl.searchParams.get('t') || '').replace(/\D/g, '')
  if (!t) return NextResponse.json({ erro: 'telefone' }, { status: 400 })
  const { contato, itens } = await abrirConversa(t)
  if (!contato) return NextResponse.json({ erro: 'nao encontrado' }, { status: 404 })
  const lead = await leadDoCliente(t, contato.lead_id, contato.reiniciada_em).catch(() => null)
  const desconto =
    contato.desconto50_de && contato.desconto50_para
      ? { de: Number(contato.desconto50_de), para: Number(contato.desconto50_para) }
      : null
  const f = lead ? fatosDoLead(lead, desconto) : null
  return NextResponse.json({
    contato,
    itens,
    simulacao: f
      ? {
          leadId: lead!.id,
          veiculo: `${f.veiculo.descricao}${f.veiculo.ano ? ` ${f.veiculo.ano}` : ''}`,
          fipe: f.veiculo.fipe,
          ativacao: f.ativacaoReferencia,
          desconto,
          planos: f.planos.map((p) => ({ nome: p.nome, mensal: p.mensal })),
        }
      : null,
  })
}
