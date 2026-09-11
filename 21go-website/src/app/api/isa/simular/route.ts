import { NextRequest, NextResponse } from 'next/server'
import { pensar } from '@/lib/isa/cerebro'
import { falaDeAdesivo } from '@/lib/isa/prompt.regras'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import { lookupPlate } from '@/lib/plate-lookup'
import { mensagensDaSimulacao } from '@/lib/isa/entrega.regras'
import { acharMarca, filtrarVersoes, mensagemVersoes, mensagemDetalhe, MAX_OPCOES } from '@/lib/isa/versoes.regras'
import { listBrandsPowerCrm, listModelsPowerCrm } from '@/lib/powercrm-lookup'
import type { MensagemHistorico } from '@/lib/isa/banco'
import { lerMidia } from '@/lib/isa/ler-midia'
import { formatoLegivel, textoDaLeitura, DOC_DE_FECHAMENTO, TAMANHO_MAXIMO } from '@/lib/isa/ler-midia.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Simulador da Isa — testa o cerebro sem mandar nada pra ninguem e sem gravar nada.
 * Protegido pelo CRON_SECRET. Serve pra conferir cota, SUSEP, desconto, genero... a qualquer
 * hora, antes de a Isa falar com cliente de verdade.
 *
 * POST { mensagens: [{ de: 'cliente'|'isa', texto }], telefone?, leadId?, nome?, genero?, hora? }
 *   ou { placa, leilao?, app?, nome? } — so consulta e monta as mensagens, sem gravar nada.
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
    placa?: string
    semPlaca?: { marca: string | null; modelo: string; ano: number }
    leilao?: boolean
    app?: boolean
    midia?: { base64: string; mime: string }
  }
  // Modo leitura: o que a Isa entende de uma foto/print/PDF (nada e gravado).
  if (b.midia?.base64 && b.midia.mime) {
    const formato = formatoLegivel(b.midia.mime)
    if (!formato) return NextResponse.json({ erro: `formato que a Isa nao le: ${b.midia.mime}` }, { status: 400 })
    const bytes = Buffer.from(b.midia.base64, 'base64')
    if (bytes.length > TAMANHO_MAXIMO) return NextResponse.json({ erro: 'arquivo grande demais' }, { status: 400 })
    const t0 = Date.now()
    const leitura = await lerMidia(bytes, b.midia.mime, formato)
    return NextResponse.json({ ms: Date.now() - t0, leitura, texto: leitura ? textoDaLeitura(null, leitura) : null, fechamento: leitura ? DOC_DE_FECHAMENTO.has(leitura.tipo) : null })
  }
  // Modo sem placa: mostra as versoes que a Isa listaria (nada e gravado).
  if (b.semPlaca) {
    const { marca: m, modelo, ano } = b.semPlaca
    const dita = m || modelo.split(' ')[0]
    let marca = acharMarca(await listBrandsPowerCrm('carro'), dita)
    let versoes = marca ? filtrarVersoes(await listModelsPowerCrm(marca.id, ano), modelo) : []
    if (versoes.length === 0) {
      const moto = acharMarca(await listBrandsPowerCrm('moto'), dita)
      const vm = moto ? filtrarVersoes(await listModelsPowerCrm(moto.id, ano), modelo) : []
      if (vm.length) { marca = moto; versoes = vm }
    }
    const mensagem = versoes.length === 0 ? null : versoes.length > MAX_OPCOES ? mensagemDetalhe(modelo, ano) : mensagemVersoes(modelo, ano, versoes)
    return NextResponse.json({ marca: marca?.text ?? null, total: versoes.length, versoes: versoes.slice(0, 10).map((v) => v.text), mensagem })
  }

  // Modo placa: mostra as 2 mensagens da simulacao SEM gravar lead e SEM criar cotacao no Power.
  if (b.placa) {
    const inicio = Date.now()
    const r = await lookupPlate(b.placa, { tabelaSePowerMudo: true, isLeilao: !!b.leilao })
    if (!r.success) return NextResponse.json({ ms: Date.now() - inicio, consulta: r })
    const fatos = fatosDoLead(
      {
        id: 'simulacao', nome: b.nome ?? null, marca_interesse: r.vehicle.marca, modelo_interesse: r.vehicle.modelo,
        ano_interesse: Number(r.vehicle.ano) || null, valor_fipe_consultado: r.vehicle.fipeValue,
        cotacao_planos: r.plans.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly })),
        carro_app: !!b.app, leilao: b.leilao ? 'leilao' : 'nao', estado: null, placa_interesse: b.placa,
        combustivel: r.vehicle.combustivel || null,
      },
      null,
    )
    return NextResponse.json({
      ms: Date.now() - inicio,
      tabela: 'planos_da_tabela' in r ? !!r.planos_da_tabela : false,
      cota: fatos.cotaPct,
      mensagens: mensagensDaSimulacao({ abertura: null, nome: b.nome ?? null, fatos, pdfUrl: '(link do PDF)', leilaoOuAppAssumido: !b.leilao && !b.app }),
    })
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
    // sem telefone no simulador, testa como cliente do Rio
    falaDeAdesivo: b.telefone ? falaDeAdesivo(b.telefone) : true,
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
