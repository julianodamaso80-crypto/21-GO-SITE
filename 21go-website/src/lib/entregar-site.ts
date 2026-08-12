import 'server-only'
import { supabaseAdmin } from './supabase-admin'
import { testarPowerlink } from './teste-powerlink'
import { avisar, textoSiteNoAr } from './whatsapp-avisos'

/**
 * A entrega do site: so manda o link depois de PROVAR que o lead cai no Power
 * do consultor.
 *
 * Regra do dono (12/08/2026): *"o link so pode ser enviado pra ele no WhatsApp
 * depois que voce tiver certeza que caiu no daquela pessoa. Fora isso voce nao
 * pode enviar. Ai voce tem que arrumar ate cair no Power ideal"*.
 *
 * Chamado de dois lugares, de proposito:
 *   - o webhook do Asaas, no minuto em que o pagamento confirma;
 *   - o cron diario, que reprocessa quem pagou mas cujo teste ainda nao passou.
 *
 * O segundo e o que cumpre o "arrumar ate cair": se o PowerLink estiver quebrado
 * hoje e alguem consertar no Power amanha, o cron detecta e entrega sozinho, sem
 * ninguem precisar lembrar de reprocessar na mao.
 */

const DONO = '5521992208062'

export interface Alvo {
  slug: string
  nome: string
  whatsapp: string
  powerlinkId: string
}

export async function entregarSeOTestePassar(alvo: Alvo): Promise<{ entregue: boolean; motivo: string | null }> {
  const supa = supabaseAdmin()

  // Trava contra entrega dupla: se ja foi entregue, nao testa nem manda de novo.
  const { data: atual } = await supa
    .from('sites_consultor')
    .select('link_enviado_em, teste_tentativas')
    .eq('slug', alvo.slug)
    .maybeSingle()

  if (atual?.link_enviado_em) return { entregue: false, motivo: 'link já foi enviado antes' }

  const tentativas = ((atual?.teste_tentativas as number) ?? 0) + 1
  const r = await testarPowerlink({
    slug: alvo.slug,
    powerlinkId: alvo.powerlinkId,
    nome: alvo.nome,
  })

  await supa
    .from('sites_consultor')
    .update({
      teste_ok: r.ok,
      teste_em: new Date().toISOString(),
      teste_tentativas: tentativas,
      teste_negociacao: r.negotiationCode,
      teste_motivo: r.motivo,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', alvo.slug)

  if (!r.ok) {
    console.error(`[entrega] ${alvo.slug}: teste REPROVADO (${tentativas}x) — ${r.motivo}`)

    // Avisa o dono na primeira falha e depois a cada 3 tentativas: silencio aqui
    // significa consultor pagando por um site que nao entrega o lead dele, mas
    // um alerta por dia sobre o mesmo problema vira ruido e ninguem le mais.
    if (tentativas === 1 || tentativas % 3 === 0) {
      await avisar(
        DONO,
        `⚠️ 21Go — site de ${alvo.nome} (21go.com.br/${alvo.slug}) NÃO foi entregue\n\n` +
          `Ele pagou, o site está no ar, mas a cotação de teste não caiu no Power dele:\n` +
          `${r.motivo}\n\n` +
          `PowerLink usado: ${alvo.powerlinkId}\n` +
          (r.negotiationCode ? `Negociação de teste: ${r.negotiationCode}\n` : '') +
          `\nO link NÃO foi mandado pra ele. Conserta no Power (Ferramentas → Powerlinks) ` +
          `que eu testo de novo sozinho e entrego quando passar. Tentativa ${tentativas}.`,
      ).catch(() => {})
    }
    return { entregue: false, motivo: r.motivo }
  }

  // ─── Passou: agora sim o link pode sair ───────────────────────────────────
  const mandou = await avisar(alvo.whatsapp, textoSiteNoAr(alvo.nome, alvo.slug))
  if (!mandou) {
    // Teste passou mas o WhatsApp falhou: NAO marca como enviado, pra o cron
    // tentar de novo amanha. Marcar aqui deixaria o consultor pagando sem nunca
    // receber o link.
    console.error(`[entrega] ${alvo.slug}: teste passou mas o WhatsApp falhou`)
    return { entregue: false, motivo: 'teste passou, mas o WhatsApp não saiu' }
  }

  await supa
    .from('sites_consultor')
    .update({ link_enviado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('slug', alvo.slug)

  console.log(`[entrega] ${alvo.slug}: teste OK (${r.responsavel}) e link enviado`)
  return { entregue: true, motivo: null }
}
