import 'server-only'

/**
 * As mensagens que o SISTEMA manda pro CONSULTOR (site no ar, boleto vencendo,
 * cancelamento). Nada aqui fala com cliente final.
 *
 * ─── Por que nao reusa `lib/whatsapp.ts` ────────────────────────────────────
 *
 * Aquele arquivo manda pela instancia `site4824`, que e o numero comercial que
 * atende CLIENTE. Misturar cobranca interna nele tem dois problemas: o cliente
 * que responder cai numa conversa de cobranca, e todo disparo de cobranca soma
 * risco de ban no unico numero que atende venda. Cobranca sai por um numero
 * separado, que se cair nao derruba o atendimento.
 *
 * Enquanto `EVOLUTION_INSTANCE_AVISOS` nao existir, o envio vira log e o resto
 * do ciclo (cortar site, liberar site) continua funcionando — a cobranca nao
 * pode depender de um WhatsApp estar de pe.
 */

const URL_BASE = process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'
const INSTANCIA = process.env.EVOLUTION_INSTANCE_AVISOS || ''
const CHAVE = process.env.EVOLUTION_API_KEY || ''

export function avisosConfigurados(): boolean {
  return Boolean(URL_BASE && INSTANCIA && CHAVE)
}

/**
 * Manda a mensagem. Nunca lanca: uma falha de WhatsApp nao pode abortar o cron
 * no meio e deixar metade dos consultores sem processar.
 */
export async function avisar(whatsapp: string, texto: string): Promise<boolean> {
  if (!avisosConfigurados()) {
    console.log(`[avisos] (desligado) ${whatsapp}: ${texto.slice(0, 60)}...`)
    return false
  }

  try {
    const res = await fetch(`${URL_BASE}/message/sendText/${INSTANCIA}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CHAVE },
      body: JSON.stringify({
        number: whatsapp,
        text: texto,
        // Ritmo humano: o Evolution digita antes de mandar. Disparo instantaneo
        // em serie e o padrao que faz numero novo ser derrubado.
        delay: 1200 + Math.floor(Math.random() * 1800),
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) {
      console.error('[avisos] evolution respondeu', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[avisos] falhou', whatsapp, (err as Error).message)
    return false
  }
}

/** Primeiro nome — as mensagens falam com a pessoa, nao com o cadastro. */
function primeiroNome(nome: string): string {
  const p = (nome || '').trim().split(/\s+/)[0] || ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

export function textoSiteNoAr(nome: string, slug: string): string {
  return (
    `Oi, ${primeiroNome(nome)}! Seu site da 21Go está no ar. 🎉\n\n` +
    `https://21go.com.br/${slug}\n\n` +
    `Pode divulgar e anunciar à vontade: quem cotar por esse link cai direto no seu Power e ` +
    `fala no seu WhatsApp.`
  )
}

export function textoVenceHoje(nome: string, slug: string, link: string | null): string {
  return (
    `Oi, ${primeiroNome(nome)}! Passando pra avisar que a mensalidade do seu site ` +
    `(21go.com.br/${slug}) vence hoje.\n\n` +
    (link ? `${link}\n\n` : '') +
    `Se já pagou, pode ignorar — às vezes leva algumas horas pra compensar.`
  )
}

/**
 * O tom aqui foi pedido pelo dono: educado, sem cobrança agressiva, e deixando
 * a porta aberta. Consultor que sai hoje volta depois.
 */
export function textoCancelado(nome: string, slug: string): string {
  return (
    `Oi, ${primeiroNome(nome)}. Como a mensalidade ficou em aberto, tirei seu site ` +
    `(21go.com.br/${slug}) do ar por enquanto.\n\n` +
    `Sem problema nenhum — fica o convite: quando quiser voltar a usar, é só me procurar que ` +
    `eu coloco no ar de novo. Obrigado por esse tempo com a gente! 🙏`
  )
}
