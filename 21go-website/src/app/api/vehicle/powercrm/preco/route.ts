import { NextRequest, NextResponse } from 'next/server'
import { listYearsPowerCrm } from '@/lib/powercrm-lookup'
import { lookupFipeDirect } from '@/lib/fipe-direct'
import { getApplicablePlans, isLeilaoOrigin, type QuotePlan } from '@/data/pricing'
import { planoNoPowerCrm } from '@/data/vehicle-allowlist'
import { planosDoPowerAoVivo } from '@/lib/powercrm-planos'
import { planosDoPowerParaTela } from '@/lib/planos-para-tela'
import { aceitaAno, decidirElegibilidade, ehBydDeLeilao } from '@/lib/elegibilidade.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Calcula valor FIPE e planos aplicáveis a partir dos IDs do PowerCRM.
 *
 * Fluxo:
 *  1. Cliente chama /preco com brandId+brandText+modelId+modelText+year+codFipe+tipo
 *  2. Servidor consulta /cmy?cm={modelId} pra obter mdlYr (ID do ano-modelo
 *     com combustível — necessário pra criar lead no PowerCRM depois)
 *  3. Servidor consulta Parallelum por codFipe+brand+model+year → valor FIPE
 *  4. Servidor calcula planos local via PRICING_TABLES
 *  5. Retorna tudo pro front montar a tela de Resultado
 *
 * Se FIPE não vier (Parallelum down ou modelo sem correspondência),
 * retorna requires_human_support pra cliente cair na tela de consultor.
 */

interface PrecoBody {
  tipo: 'carro' | 'moto'
  brandId: number | string
  brandText: string
  modelId: number | string
  modelText: string
  year: number | string
  codFipe?: string | null
  /** Origem do veículo: 'nao' | 'leilao' | 'remarcado'. Leilão paga a faixa abaixo. */
  leilao?: string | null
}

export async function POST(req: NextRequest) {
  let body: PrecoBody
  try {
    body = (await req.json()) as PrecoBody
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const { tipo, brandId, brandText, modelId, modelText, year, codFipe } = body
  if (!brandId || !modelId || !year) {
    return NextResponse.json(
      { success: false, error: 'brandId, modelId e year obrigatórios' },
      { status: 200 },
    )
  }

  const yearStr = String(year).match(/(\d{4})/)?.[1]
  if (!yearStr) {
    return NextResponse.json({ success: false, error: 'ano inválido' }, { status: 200 })
  }

  // 1) Veículo anterior a 2006 nem chega a ser perguntado ao Power: as tabelas dele cotam até
  //    1998, mas a 21Go não aceita (ordem do dono, 12/08/2026 — um Ford Ka 2003 saiu cotado).
  if (!aceitaAno(Number(yearStr))) {
    return NextResponse.json({
      success: true,
      excluded: true,
      reason: 'ano',
      vehicle: {
        marca: brandText,
        modelo: modelText,
        ano: yearStr,
        fipeValue: null,
        fipeCode: codFipe || null,
        categoria: tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL',
        combustivel: null,
      },
      powercrm: { brandId: Number(brandId), modelId: Number(modelId), yearId: null },
      plans: [],
    })
  }

  // 1.1) BYD de leilão/remarcado: não fazemos, nenhum modelo (ordem do dono, 27/08/2026).
  //      Antes do Power pelo mesmo motivo do ano — ele cota normalmente, e aqui a regra é
  //      comercial, não cadastro dele. Um Song Pro 2025 de leilão saiu do site com plano
  //      Veículos Especiais e ativação de R$ 1.550.
  if (ehBydDeLeilao(brandText, modelText, body.leilao)) {
    return NextResponse.json({
      success: true,
      excluded: true,
      reason: 'byd_leilao',
      vehicle: {
        marca: brandText,
        modelo: modelText,
        ano: yearStr,
        fipeValue: null,
        fipeCode: codFipe || null,
        categoria: tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL',
        combustivel: null,
      },
      powercrm: { brandId: Number(brandId), modelId: Number(modelId), yearId: null },
      plans: [],
    })
  }

  // 2) Pega ano-modelo (mdlYr) detalhado do PowerCRM — necessário pra criar lead e pra
  //    perguntar ao Power quais planos ele daria pra esse veículo
  let mdlYr: number | undefined
  let combustivel: string | undefined
  try {
    const years = await listYearsPowerCrm(modelId)
    // Os items vêm como { id, text } onde text = "2022 Flex" ou "2022 Híbrido"
    const match = years.find((y) => (y.text || '').startsWith(yearStr))
    if (match) {
      mdlYr = match.id
      // Extrai o combustível (segunda palavra do text)
      combustivel = (match.text || '').replace(/^\d{4}\s*/, '').trim() || undefined
    }
  } catch {
    // segue — mdlYr é opcional
  }

  // 3) Passado o ano, quem decide se fazemos o veículo é o PowerCRM. Perguntamos ao vivo (é a mesma
  //    resposta que o consultor vê na cotação dele). Fica no servidor de propósito — é a camada
  //    que o cliente não burla — e antes do FIPE, pra não gastar consulta externa à toa.
  //
  //    Regra de 06/08/2026 (ordem do dono, depois de perder venda com veículo que fazemos):
  //    "não fazemos esse veículo" só sai da boca do site quando o Power CONFIRMA que não dá
  //    plano. Se o Power não respondeu, o cliente vai pro consultor — nunca é dispensado.
  //    A allowlist extraída virou só desempate: ela envelhece (em 3 dias já bloqueava o BYD
  //    Dolphin Mini, que o Power cota), então não pode mais dispensar cliente sozinha.
  //    Ele nao decide so "faz ou nao faz": os planos que aparecem e o PRECO de cada um sao os
  //    dele (ordem do dono, 31/08/2026, depois de o site mostrar "SUV R$ 377,50" pra uma BMW X1
  //    que o Power cota como carro comum com VIP R$ 359,04). A tabela local so entra quando o
  //    Power fica mudo.
  const consulta = await planosDoPowerAoVivo(modelId, mdlYr)

  const veredicto = decidirElegibilidade({
    ano: Number(yearStr),
    powerAoVivo: consulta.planos === null ? null : consulta.planos.length > 0,
    allowlist: planoNoPowerCrm(modelId),
  })

  if (veredicto.acao === 'consultor') {
    return NextResponse.json({
      success: false,
      requires_human_support: true,
      reason: veredicto.motivo,
      error: 'Não conseguimos confirmar a cobertura desse veículo agora — fale com nossa consultora',
      meta: { brandId, brandText, modelId, modelText, year: yearStr, mdlYr },
    })
  }

  const motivoExclusao = veredicto.acao === 'nao_fazemos' ? veredicto.motivo : null
  if (motivoExclusao) {
    return NextResponse.json({
      success: true,
      excluded: true,
      reason: motivoExclusao,
      vehicle: {
        marca: brandText,
        modelo: modelText,
        ano: yearStr,
        fipeValue: null,
        fipeCode: codFipe || null,
        categoria: tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL',
        combustivel: combustivel || null,
      },
      powercrm: { brandId: Number(brandId), modelId: Number(modelId), yearId: mdlYr || null },
      plans: [],
    })
  }

  // 3) Pega valor FIPE da Parallelum (fonte de verdade do VALOR — PowerCRM não devolve)
  const direct = await lookupFipeDirect({
    brand: brandText,
    model: modelText,
    year: Number(yearStr),
    codFipe: codFipe || undefined,
    categoria: tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL',
  })

  if (!direct || !direct.fipeValue || direct.fipeValue <= 0) {
    return NextResponse.json({
      success: false,
      requires_human_support: true,
      reason: 'fipe_indisponivel',
      error: 'Valor FIPE indisponível no momento — fale com nossa consultora',
      // Devolve metadados úteis pro front pré-preencher o lead parcial
      meta: {
        brandId,
        brandText,
        modelId,
        modelText,
        year: yearStr,
        mdlYr,
      },
    })
  }

  // 4) Planos: os que o PowerCRM deu, com o preço dele (leilão/remarcado desce uma faixa).
  //    Só cai na tabela local quando o Power não respondeu — aí a allowlist já deixou cotar.
  const categoria = tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL'
  const isLeilao = isLeilaoOrigin(body.leilao)
  const plans: QuotePlan[] = consulta.planos?.length
    ? planosDoPowerParaTela(consulta.planos, direct.fipeValue, isLeilao)
    : getApplicablePlans(
        direct.fipeValue,
        categoria,
        combustivel || direct.matchedYear,
        undefined,
        modelText,
        isLeilao,
      )

  return NextResponse.json({
    success: true,
    vehicle: {
      marca: brandText,
      modelo: modelText,
      ano: yearStr,
      fipeValue: direct.fipeValue,
      fipeCode: codFipe || direct.codeFipe || null,
      categoria,
      combustivel: combustivel || direct.matchedYear,
    },
    powercrm: {
      brandId: Number(brandId),
      modelId: Number(modelId),
      yearId: mdlYr || null,
    },
    /** De onde saiu a lista de planos e o preço — 'power' é o normal, 'tabela' é o Power mudo. */
    plans_source: consulta.planos?.length ? 'power' : 'tabela',
    plans,
  })
}
