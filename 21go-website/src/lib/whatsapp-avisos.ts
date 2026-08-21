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

/**
 * O canal RESERVA: a instancia da casa (`site4824`), a mesma do `lib/whatsapp.ts`.
 *
 * ⚠️ Existe por um incidente real (21/08/2026). O canal de avisos e a instancia
 * `julianodamaso` — o celular do proprio dono — e os chips caem sozinhos toda
 * hora. Naquele dia ela estava `close`, e o efeito foi este: a Renata pagou, o
 * site subiu, o teste do PowerLink passou, e o link NAO foi entregue. Pior: o
 * alerta "nao entreguei" tambem sai por este mesmo canal, entao o silencio foi
 * completo — o dono so descobriu porque a consultora reclamou.
 *
 * Um canal so, usado pra entregar E pra alertar que a entrega falhou, nao e
 * redundancia nenhuma. Por isso a reserva: se o numero de avisos estiver fora,
 * a mensagem sai pelo da casa em vez de nao sair.
 *
 * Continua valendo a preferencia pelo numero separado (ver o cabecalho): a casa
 * e o ULTIMO recurso, so quando o de avisos falhou de fato.
 */
const RESERVA_URL = process.env.EVOLUTION_API_URL || ''
const RESERVA_INSTANCIA = process.env.EVOLUTION_INSTANCE || ''
const RESERVA_CHAVE = process.env.EVOLUTION_API_KEY || ''

interface Canal {
  nome: string
  url: string
  instancia: string
  chave: string
}

/** Os canais em ordem de preferencia, so os que estao configurados. */
function canais(): Canal[] {
  const lista: Canal[] = []
  if (URL_BASE && INSTANCIA && CHAVE) {
    lista.push({ nome: INSTANCIA, url: URL_BASE, instancia: INSTANCIA, chave: CHAVE })
  }
  if (RESERVA_URL && RESERVA_INSTANCIA && RESERVA_CHAVE) {
    lista.push({
      nome: `${RESERVA_INSTANCIA} (reserva)`,
      url: RESERVA_URL,
      instancia: RESERVA_INSTANCIA,
      chave: RESERVA_CHAVE,
    })
  }
  return lista
}

export function avisosConfigurados(): boolean {
  return canais().length > 0
}

/** Uma tentativa num canal. `true` so quando o Evolution aceitou de fato. */
async function tentar(
  canal: Canal,
  rota: string,
  corpo: Record<string, unknown>,
  timeout: number,
): Promise<boolean> {
  try {
    const res = await fetch(`${canal.url}/message/${rota}/${canal.instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: canal.chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) {
      // "Connection Closed" (500) e o chip desconectado — o caso do 21/08/2026.
      console.error(
        `[avisos] ${canal.nome} respondeu`,
        res.status,
        await res.text().catch(() => ''),
      )
      return false
    }
    return true
  } catch (err) {
    console.error(`[avisos] ${canal.nome} falhou`, (err as Error).message)
    return false
  }
}

/**
 * Manda a mensagem, tentando os canais em ordem. Nunca lanca: uma falha de
 * WhatsApp nao pode abortar o cron no meio e deixar metade dos consultores sem
 * processar.
 */
export async function avisar(whatsapp: string, texto: string): Promise<boolean> {
  const lista = canais()
  if (!lista.length) {
    console.log(`[avisos] (desligado) ${whatsapp}: ${texto.slice(0, 60)}...`)
    return false
  }

  for (const canal of lista) {
    const ok = await tentar(
      canal,
      'sendText',
      {
        number: whatsapp,
        text: texto,
        // Ritmo humano: o Evolution digita antes de mandar. Disparo instantaneo
        // em serie e o padrao que faz numero novo ser derrubado.
        delay: 1200 + Math.floor(Math.random() * 1800),
      },
      25_000,
    )
    if (ok) {
      if (canal.nome.includes('reserva')) {
        console.warn(`[avisos] saiu pela RESERVA (${canal.instancia}) — o canal de avisos está fora`)
      }
      return true
    }
  }

  console.error(`[avisos] nenhum canal aceitou a mensagem pra ${whatsapp}`)
  return false
}

/**
 * Qual canal esta de pe, sem mandar mensagem nenhuma.
 *
 * O cron usa isto pra gritar ANTES de alguem ficar sem receber: canal de avisos
 * fora significa entrega de site dependendo da reserva, e os dois fora significa
 * que ninguem vai receber nada e ninguem vai ser avisado disso.
 */
export async function saudeDosCanais(): Promise<{
  ok: boolean
  detalhes: { nome: string; estado: string }[]
}> {
  const detalhes = await Promise.all(
    canais().map(async (c) => {
      try {
        const res = await fetch(`${c.url}/instance/connectionState/${c.instancia}`, {
          headers: { apikey: c.chave },
          signal: AbortSignal.timeout(15_000),
        })
        const corpo = (await res.json().catch(() => null)) as {
          instance?: { state?: string }
        } | null
        return { nome: c.nome, estado: corpo?.instance?.state || `http ${res.status}` }
      } catch (err) {
        return { nome: c.nome, estado: `erro: ${(err as Error).message}` }
      }
    }),
  )
  return { ok: detalhes.some((d) => d.estado === 'open'), detalhes }
}

/**
 * Manda um documento (o PDF da cotacao) pelo mesmo canal do `avisar`.
 *
 * Existe pra o consultor receber a simulacao pronta, do mesmo numero que ja
 * fala com ele — e NAO pelo chip da casa, que e o que atende cliente. Se o
 * numero de avisos cair, o consultor deixa de receber o PDF, mas nenhum cliente
 * fica sem atendimento.
 *
 * Nunca lanca, pelo mesmo motivo do `avisar`: o lead ja esta salvo no Power e no
 * banco quando isto roda. WhatsApp que falha nao pode derrubar o resto.
 */
export async function avisarComPdf(
  whatsapp: string,
  legenda: string,
  media: string,
  nomeArquivo: string,
): Promise<boolean> {
  const lista = canais()
  if (!lista.length) {
    console.log(`[avisos] (desligado) PDF pra ${whatsapp}: ${nomeArquivo}`)
    return false
  }

  for (const canal of lista) {
    const ok = await tentar(
      canal,
      'sendMedia',
      {
        number: whatsapp,
        mediatype: 'document',
        mimetype: 'application/pdf',
        media,
        caption: legenda,
        fileName: nomeArquivo,
        delay: 1200 + Math.floor(Math.random() * 1800),
      },
      45_000,
    )
    if (ok) return true
  }
  return false
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

/**
 * O calendario de cobranca, ordem do dono (21/08/2026):
 *
 *   *"VC ENVIA SO O PAGAMENTO 5 DIAS ANTES DE VENCER CADA CLIENTE, EXEMPLO SE
 *   VENCE DIA 5 VC ENVIA DIA 1, DEPOIS ENVIA NO DIA 4, E SE NAO PAGOU FALA QUE
 *   E ULTIMO DIA NO DIA 5. E SE NAO PAGOU VC CANCELA O SITE SEM MAIS NENHUMA
 *   MENSAGEM 2 DIAS DEPOIS."*
 *
 * Sao tres mensagens e so tres, cada uma no dia de vencimento DAQUELA pessoa —
 * nunca numa data fixa do mes. O corte no D+2 e mudo.
 *
 * ⚠️ O exemplo dele ("vence dia 5 → avisa dia 1") e o que manda na primeira
 * mensagem: sao 4 dias de antecedencia, dentro da janela de "5 dias antes".
 */
export function textoPrimeiroAviso(
  nome: string,
  slug: string,
  vencimento: string,
  link: string | null,
): string {
  return (
    `Oi, ${primeiroNome(nome)}! Sua mensalidade do site 21Go ` +
    `(21go.com.br/${slug}) vence em ${dataCurta(vencimento)}.\n\n` +
    `São R$ 80,00 — já deixo o pagamento aqui pra você adiantar quando puder:\n` +
    (link ? `${link}\n\n` : '\n') +
    `Qualquer coisa é só me chamar por aqui.`
  )
}

export function textoVesperaDoVencimento(
  nome: string,
  slug: string,
  link: string | null,
): string {
  return (
    `Oi, ${primeiroNome(nome)}! Lembrete rápido: a mensalidade do seu site ` +
    `(21go.com.br/${slug}) vence amanhã — R$ 80,00.\n\n` +
    (link ? `${link}\n\n` : '') +
    `Se já pagou, pode ignorar essa mensagem. 🙂`
  )
}

export function textoUltimoDia(nome: string, slug: string, link: string | null): string {
  return (
    `Oi, ${primeiroNome(nome)}! Hoje é o último dia da mensalidade do seu site ` +
    `(21go.com.br/${slug}) — R$ 80,00.\n\n` +
    (link ? `${link}\n\n` : '') +
    `Pagando hoje, seu site continua no ar normalmente. Se já pagou, é só ignorar.`
  )
}

/** "2026-09-05" -> "05/09". As mensagens falam a data dele, nao um ISO. */
function dataCurta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}`
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
 * Avisa o consultor que entrou uma cotacao no site DELE.
 *
 * Ordem do dono (19/08/2026): *"so ele recebe o pdf e ele chama o associado (...)
 * com numero do associado, detalhes do plano ue ai facilita para ele chamar"*.
 * Ate aqui o site vendido nao avisava nada — o consultor so descobria o lead
 * abrindo o Power, e lead de madrugada ficava horas parado.
 *
 * A mensagem e feita pra ele NAO precisar abrir mais nada antes de ligar: nome,
 * telefone clicavel, veiculo e o plano com o valor ja calculado. O PDF vem logo
 * atras, pronto pra encaminhar.
 *
 * Vai em TODA cotacao de site vendido, nao so nas indicadas (ver
 * `textoLeadIndicado`): quem paga pelo site comprou justamente o lead.
 */
export function textoCotacaoNova(dados: {
  leadNome: string
  leadWhatsapp: string
  veiculo: string | null
  placa: string | null
  ano: string | null
  fipe: number | null
  plano: string | null
  valorMensal: number | null
  comPdf: boolean
}): string {
  const fone = (w: string) => {
    const d = w.replace(/\D/g, '').replace(/^55/, '')
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : w
  }
  const digitos = dados.leadWhatsapp.replace(/\D/g, '')
  const zap = digitos.startsWith('55') ? digitos : `55${digitos}`

  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const linhas = [`🔔 *Nova cotação no seu site*`, ``, `*${dados.leadNome}*`, fone(dados.leadWhatsapp)]

  if (dados.veiculo) {
    linhas.push(``, dados.placa ? `${dados.veiculo} — placa *${dados.placa}*` : dados.veiculo)
    const ficha = [dados.ano, dados.fipe ? `FIPE R$ ${brl(dados.fipe)}` : null].filter(Boolean)
    if (ficha.length) linhas.push(ficha.join(' · '))
  }
  if (dados.plano && dados.valorMensal) {
    linhas.push(`Plano *${dados.plano}* — R$ ${brl(dados.valorMensal)}/mês`)
  }

  linhas.push(``, `Chamar agora: https://wa.me/${zap}`)
  linhas.push(
    ``,
    dados.comPdf
      ? `A simulação em PDF vem logo abaixo — só encaminhar pra ele.`
      : `A cotação ficou incompleta, então não saiu PDF — vale ligar pra fechar os dados.`,
  )
  return linhas.join('\n')
}

/**
 * ⚠️ FORA DE USO desde 21/08/2026, de proposito. A ordem passou a ser cortar
 * *"SEM MAIS NENHUMA MENSAGEM 2 DIAS DEPOIS"* — quem nao pagou ja recebeu tres
 * avisos (D-4, D-1, D0) e uma quarta mensagem no corte vira cobranca chata.
 *
 * Fica aqui, e nao apagada, porque e uma decisao de tom que ja mudou uma vez:
 * se o dono quiser a despedida educada de volta, e so o `cortar()` chamar isto.
 *
 * O tom foi pedido por ele: educado, sem cobranca agressiva, porta aberta.
 */
export function textoCancelado(nome: string, slug: string): string {
  return (
    `Oi, ${primeiroNome(nome)}. Como a mensalidade ficou em aberto, tirei seu site ` +
    `(21go.com.br/${slug}) do ar por enquanto.\n\n` +
    `Sem problema nenhum — fica o convite: quando quiser voltar a usar, é só me procurar que ` +
    `eu coloco no ar de novo. Obrigado por esse tempo com a gente! 🙏`
  )
}
