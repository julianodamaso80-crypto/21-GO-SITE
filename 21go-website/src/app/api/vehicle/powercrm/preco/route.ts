import { NextRequest, NextResponse } from 'next/server'
import { listYearsPowerCrm } from '@/lib/powercrm-lookup'
import { lookupFipeDirect } from '@/lib/fipe-direct'
import { getApplicablePlans, isLeilaoOrigin, type QuotePlan } from '@/data/pricing'
import { planoNoPowerCrm } from '@/data/vehicle-allowlist'
import { isYearTooOld } from '@/data/vehicle-exclusions'
import { temProtecaoNoPowerAoVivo } from '@/lib/powercrm-planos'

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

  // 1) Pega ano-modelo (mdlYr) detalhado do PowerCRM — necessário pra criar lead e pra
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

  // 2) Quem decide se fazemos o veículo é o PowerCRM. Perguntamos a ele primeiro (é a resposta
  //    que o consultor veria) e só caímos na allowlist extraída quando a API não responde.
  //    Fica no servidor de propósito — é a camada que o cliente não burla — e antes do FIPE,
  //    pra não gastar consulta externa com veículo que não vai ser cotado.
  const anoVelhoDemais = isYearTooOld(yearStr)
  const aoVivo = anoVelhoDemais ? null : await temProtecaoNoPowerAoVivo(modelId, mdlYr)
  const temPlano = aoVivo !== null ? aoVivo : planoNoPowerCrm(modelId)
  const motivoExclusao = anoVelhoDemais ? 'year' : temPlano === false ? 'model' : null
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

  // 3) Calcula planos local (leilão/remarcado desce uma faixa na tabela)
  const categoria = tipo === 'moto' ? 'MOTOCICLETA' : 'AUTOMOVEL'
  const plans: QuotePlan[] = getApplicablePlans(
    direct.fipeValue,
    categoria,
    combustivel || direct.matchedYear,
    undefined,
    modelText,
    isLeilaoOrigin(body.leilao),
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
    plans,
  })
}
