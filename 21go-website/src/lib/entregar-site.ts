import 'server-only'
import { supabaseAdmin } from './supabase-admin'
import { testarPowerlink } from './teste-powerlink'
import { avisar, avisarDono, saudeDoCanal, textoSiteNoAr } from './whatsapp-avisos'

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

export async function entregarSeOTestePassar(
  alvo: Alvo,
  opcoes?: { alertarDono?: boolean },
): Promise<{ entregue: boolean; motivo: string | null }> {
  const supa = supabaseAdmin()

  // Trava contra entrega dupla: se ja foi entregue, nao testa nem manda de novo.
  const { data: atual } = await supa
    .from('sites_consultor')
    .select('link_enviado_em, teste_tentativas')
    .eq('slug', alvo.slug)
    .maybeSingle()

  if (atual?.link_enviado_em) return { entregue: false, motivo: 'link já foi enviado antes' }

  // ─── O WhatsApp do dono esta de pe? ───────────────────────────────────────
  // Se nao estiver, PARA aqui: nao testa o Power (a cotacao de teste suja o
  // funil dele a toa) e, principalmente, nao procura outro numero pra mandar.
  // Ordem do dono, 21/08/2026: *"se meu wpp tiver desconectado vc NAO ENVIA DE
  // NINGUEM e me avisa"*. No mesmo dia eu fiz a entrega sair pelo numero da
  // casa sem ele pedir, e duas pessoas receberam o site de um numero que ele
  // nunca autorizou. Chip fora e motivo pra parar, nao pra contornar.
  const canal = await saudeDoCanal()
  if (!canal.ok) {
    console.error(`[entrega] ${alvo.slug}: NAO entreguei — WhatsApp do dono ${canal.estado}`)
    if (opcoes?.alertarDono) {
      await avisarDono(
        DONO,
        `🚨 21Go — ${alvo.nome} PAGOU e não recebeu o site\n\n` +
          `Site: 21go.com.br/${alvo.slug}\n\n` +
          `Seu WhatsApp está *${canal.estado}* na Evolution, e venda de site só sai pelo ` +
          `seu número — então não mandei por ninguém, como você pediu.\n\n` +
          `Assim que você reconectar, eu entrego sozinho (tento a cada 15 min).`,
      ).catch(() => {})
    }
    return { entregue: false, motivo: `WhatsApp do dono ${canal.estado}` }
  }

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
      await avisarDono(
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
    // Teste passou mas o WhatsApp falhou: NAO marca como enviado, pra a proxima
    // rodada tentar de novo. Marcar aqui deixaria o consultor pagando sem nunca
    // receber o link.
    console.error(`[entrega] ${alvo.slug}: teste passou mas o WhatsApp falhou`)

    // ⚠️ Este alerta faltava, e a falta dele foi o incidente de 21/08/2026: a
    // Renata pagou, o site subiu, o teste passou, o WhatsApp estava fora e
    // NINGUEM soube. So o teste reprovado avisava o dono; canal caido era
    // silencio total ate o cliente reclamar. O aviso PRA O DONO pode sair pelo
    // numero interno — e justamente o chip dele que costuma estar fora. A
    // mensagem PRA O CONSULTOR, essa, nao sai de outro numero nunca.
    if (opcoes?.alertarDono) {
      await avisarDono(
        DONO,
        `🚨 21Go — ${alvo.nome} PAGOU e NÃO recebeu o link\n\n` +
          `Site: 21go.com.br/${alvo.slug}\n` +
          `WhatsApp dele(a): ${alvo.whatsapp}\n\n` +
          `O site está no ar e o teste do Power passou. O que falhou foi o envio ` +
          `pelo seu número — não mandei por mais ninguém.\n\n` +
          `Eu tento de novo a cada 15 min sozinho.`,
      ).catch(() => {})
    }

    return { entregue: false, motivo: 'teste passou, mas o WhatsApp não saiu' }
  }

  await supa
    .from('sites_consultor')
    .update({ link_enviado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('slug', alvo.slug)

  console.log(`[entrega] ${alvo.slug}: teste OK (${r.responsavel}) e link enviado`)
  return { entregue: true, motivo: null }
}
