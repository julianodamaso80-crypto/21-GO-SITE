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

/**
 * URL e chave PROPRIAS, nao as do `lib/whatsapp.ts`: a instancia de avisos vive
 * em outra Evolution (`automacoes-evolution-api...`), nao na do site. Herdar a
 * URL do site mandaria os avisos pro servidor errado com uma chave que nao vale
 * la — e falharia calado.
 */
const URL_BASE = process.env.EVOLUTION_AVISOS_URL || ''
const INSTANCIA = process.env.EVOLUTION_AVISOS_INSTANCE || ''
const CHAVE = process.env.EVOLUTION_AVISOS_KEY || ''

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
 * Avisa que alguem entrou no Indique e Ganhe pelo site.
 *
 * So na PRIMEIRA vez de cada pessoa: quem reabre a pagina pra pegar o proprio
 * link de novo nao pode gerar aviso repetido.
 */
export function textoNovoIndicador(dados: {
  nome: string
  whatsapp: string
  link: string
}): string {
  const fone = (w: string) => {
    const d = w.replace(/\D/g, '').replace(/^55/, '')
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : w
  }
  return (
    `🎁 *Novo no Indique e Ganhe*\n\n` +
    `*${dados.nome}* acabou de pegar o link de indicação no seu site.\n` +
    `${fone(dados.whatsapp)}\n\n` +
    `Link dele(a): ${dados.link}\n\n` +
    `Quando alguém fechar por esse link, eu te aviso na hora.`
  )
}

/**
 * Avisa que entrou um lead INDICADO.
 *
 * Existe porque o Power nao aceita essa informacao por API: testado em
 * 12/08/2026, `noteContract` nao volta na leitura e os campos `utm*` sao
 * ignorados no `/quotation/add` (o Power so os preenche quando a cotacao nasce
 * pelo hotlink dele). Sem este aviso, quem indicou some entre o clique e o
 * atendimento, e o consultor atende sem saber que tem um nome conhecido pra
 * citar na abordagem.
 *
 * So dispara em lead COM indicacao — mandar em todo lead viraria spam e poria o
 * numero em risco por volume.
 */
export function textoLeadIndicado(dados: {
  leadNome: string
  leadWhatsapp: string
  indicadorNome: string
  indicadorWhatsapp: string
}): string {
  const fone = (w: string) => {
    const d = w.replace(/\D/g, '').replace(/^55/, '')
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : w
  }
  return (
    `🔔 *Lead indicado no seu site*\n\n` +
    `*${dados.leadNome}* acabou de fazer uma cotação.\n` +
    `${fone(dados.leadWhatsapp)}\n\n` +
    `Quem indicou: *${dados.indicadorNome}* — ${fone(dados.indicadorWhatsapp)}\n\n` +
    `Vale citar na conversa: quem chega por indicação já vem com confiança.`
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
