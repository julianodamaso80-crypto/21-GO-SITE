/**
 * A mensagem que a Isa manda depois de simular (formato do dono, 11/09/2026 — substitui as duas
 * mensagens com emoji de 10/09): nome, veiculo, FIPE, os planos com preco, ativacao e o PDF.
 *
 * Montadas pelo CODIGO a partir dos fatos — a IA nao escreve preco de plano. Lista exatamente os
 * planos que vieram do Power (ou da tabela, no Power mudo), nem mais nem menos.
 */

import type { Fatos } from './fatos.regras'
import type { HumanoDoBot } from './identidade.regras'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Formato do dono (11/09/2026): nome, veiculo, FIPE, TODOS os planos que o veiculo pode ter com o
 * preco, ativacao, o link do PDF e, no fim, a pergunta. Uma mensagem so. Se a Isa cotou assumindo
 * "nao e leilao nem aplicativo", o aviso vai numa segunda mensagem curta.
 */
export function mensagensDaSimulacao(p: {
  abertura: string | null
  /** Nome como o cliente se identificou (o do lead / do WhatsApp). */
  nome: string | null
  fatos: Fatos
  pdfUrl: string
  /** O cliente nao disse se e de leilao nem se e de aplicativo — a Isa cotou como "nao". */
  leilaoOuAppAssumido: boolean
}): string[] {
  const f = p.fatos
  const v = f.veiculo
  const linhas: string[] = []
  if (p.abertura) linhas.push(p.abertura, '')
  if (p.nome?.trim()) linhas.push(`Nome: ${p.nome.trim()}`)
  linhas.push(`Veículo: ${v.descricao}${v.ano ? ` ${v.ano}` : ''}`)
  if (v.fipe) linhas.push(`FIPE: ${brl(v.fipe)}`)
  for (const pl of f.planos) {
    const extra = pl.ativacao && pl.ativacao !== f.ativacaoReferencia ? ` (ativação ${brl(pl.ativacao)})` : ''
    linhas.push(`Plano ${pl.nome} · ${brl(pl.mensal)}/mês${extra}`)
  }
  if (f.ativacaoReferencia) linhas.push(`Ativação: ${brl(f.ativacaoReferencia)}`)
  linhas.push(`Sua simulação completa (PDF): ${p.pdfUrl}`)
  linhas.push('', f.planos.length === 1 ? 'esse plano se encaixa com o que você está buscando?' : 'qual deles se encaixa mais com o que você está buscando?')
  const partes = [linhas.join('\n')]
  // Leilao, remarcado, taxi ou sinistrado: o preco cai e a indenizacao tambem — dizer junto com o
  // valor, nao deixar o cliente descobrir no sinistro (auditoria de 12/09/2026).
  if (f.indenizacaoPct === 80) partes.push('como o veículo é de leilão (a mesma regra vale pra remarcado, táxi e sinistrado), a indenização em roubo, furto ou perda total é 80% da FIPE')
  if (p.leilaoOuAppAssumido) partes.push('ah, considerei que não é de leilão nem de aplicativo, se for me avisa que eu ajusto 👍')
  return partes
}

/**
 * Placa que nenhuma fonte achou (Power sem dado, API Brasil fora). Quem simula e a Isa — NUNCA
 * manda pro 4824 (dono, 11/09/2026: "quem faz a cotacao e voce"). Pede pra conferir e oferece
 * fazer pelo modelo e ano.
 */
export function mensagemPlacaNaoAchada(comoApareceNoDenatran: string | null = null): string {
  // A placa existe mas nao deu preco (ex.: RKW7J62 e uma carreta): dizer o que o DENATRAN mostra
  // faz o cliente perceber se digitou errado — "nao achei" parecia que a placa nao existia.
  if (comoApareceNoDenatran) {
    return `essa placa aparece registrada como ${comoApareceNoDenatran} 🤔\n\nconfere pra mim se é essa mesmo? se for outro veículo, me manda a placa certinha ou o modelo e o ano, que eu faço a simulação`
  }
  return 'não consegui achar essa placa aqui 🤔\n\nconfere pra mim se está certinha? se preferir, me fala o modelo e o ano do veículo, que eu faço a simulação por eles'
}

/** Modelo escolhido que nao deu preco: pede pra confirmar, nunca transfere. */
export function mensagemModeloSemPreco(): string {
  return 'não consegui simular esse veículo aqui 🤔\n\nme confirma o modelo e o ano? se tiver a placa, pode me mandar também'
}

/** Mesmo texto da tela do site quando a 21Go nao faz o veiculo. */
export function mensagemNaoFazemos(motivo: string): string {
  if (motivo === 'ano') {
    return 'infelizmente no momento não estamos aceitando veículos com ano anterior a 2006 🙏🏼'
  }
  if (motivo === 'moto_leilao') return 'infelizmente não aceitamos moto de leilão 🙏🏼'
  return 'infelizmente no momento não estamos aceitando esse veículo 🙏🏼'
}

/**
 * Placa chegou: antes dos valores a Isa pergunta leilao e aplicativo JUNTOS (dono, 11/09/2026 —
 * antes ela cotava assumindo "nao" e avisava depois, e o preco podia mudar na frente do cliente).
 */
export function mensagemPerguntaLeilaoApp(abertura: string | null): string {
  const t = 'antes de te passar os valores, me confirma: o veículo é de leilão? e roda em aplicativo (uber, 99)?'
  return abertura ? `${abertura}\n\n${t}` : t
}

const APP = /\b(uber|99|99pop|indriver|aplicativo|app)\b/
// "sem" tambem e negacao (dono, 12/09/2026: "sem leilão" virou leilao e a moto foi recusada a toa).
const NAO_APP = /\b(nao|nem|nunca|sem)\s+(\w+\s+){0,3}(uber|99|99pop|indriver|aplicativo|app)\b|\b(uber|99|aplicativo|app)\s+nao\b/
const NAO_LEILAO = /\b(nao|nem|nunca|sem)\s+(e\s+)?(de\s+)?leil|leil\w*\s+nao\b/

/**
 * Resposta a pergunta de leilao/aplicativo. `null` = o cliente nao disse (ai a IA le a conversa).
 * Resposta curta segue a ordem da pergunta: "nao e sim" = nao e leilao, roda em app.
 */
export function lerLeilaoApp(texto: string | null | undefined): { leilao: boolean | null; app: boolean | null } {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const curto = t.replace(/[.!,;]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^(n|nao|nop|negativo|nao e nao|nao nao|os dois nao|nenhum( dos (dois|2))?|nenhuma( das duas)?|nem um nem outro)$/.test(curto)) {
    return { leilao: false, app: false }
  }
  if (/^sim (e )?nao$/.test(curto)) return { leilao: true, app: false }
  if (/^nao (e )?sim$/.test(curto)) return { leilao: false, app: true }
  if (/^(sim (e )?sim|ambos|os dois sim|sim (os|as|pros|pras) (dois|duas|2))$/.test(curto)) return { leilao: true, app: true }

  const r: { leilao: boolean | null; app: boolean | null } = { leilao: null, app: null }
  if (/leil/.test(t)) r.leilao = !NAO_LEILAO.test(t)
  if (APP.test(t)) r.app = !NAO_APP.test(t)
  else if (/\bparticular\b/.test(t)) r.app = false
  // "nao, trabalho no 99" / "nao. uso particular": o "nao" do comeco responde a 1a pergunta.
  if (r.leilao === null && (r.app !== null) && /^nao\b/.test(t)) r.leilao = false
  return r
}

/**
 * Mandou o documento PEDINDO cotacao ("simula esse agora", "quanto fica esse?"). Ai o CRLV e so o
 * jeito dele passar a placa — a Isa simula em vez de transferir pro 4824 (dono, 12/09/2026).
 */
const PEDIDO_DE_SIMULACAO =
  /(simul|cotac|cotaç|orcament|orçament|quanto (fica|custa|sai)|me passa o valor|valor desse|preco desse|preço desse)/i

export function ehPedidoDeSimulacao(texto: string | null | undefined): boolean {
  return PEDIDO_DE_SIMULACAO.test((texto || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

/** Dono, 11/09/2026: a 21Go nao aceita moto de leilao (carro de leilao aceita). */
export function recusaMotoDeLeilao(categoria: string | null | undefined, leilao: boolean): boolean {
  return leilao && categoria === 'MOTOCICLETA'
}

/**
 * O cliente escolheu um plano ("gostei do vip", "quero o basico", "vou fechar com o premium")?
 * Entao o proximo passo e pedir os documentos (dono, 11/09/2026) — no teste, a IA respondeu as
 * outras perguntas e esqueceu desse passo, por isso ele e do codigo.
 */
const ESCOLHA =
  /\b(gostei|quero|vou (de|fechar|ficar|querer)|fechar com|fecho com|prefiro|pode ser o|vamos de|bora de|escolho|fico com)\b[^.?!\n]{0,25}\b(b[aá]sico|vip|premium|do seu jeito|especia(l|is)|suv|moto)\b/i

export function escolheuPlano(texto: string | null | undefined): boolean {
  return ESCOLHA.test(texto || '')
}

/**
 * Ele decidiu SEGUIR, nao so disse de qual plano gostou. Dono, 14/09/2026 (print da Deiselane:
 * ela respondeu "Completo de tudo" e a Isa ja pediu CNH): "nao era pra falar do doc agora, tem q
 * se preocupar com cliente, espera oportunidade certa de mandar pedindo doc, isso e ultima etapa".
 * Gostar de um plano NAO e fechar. Melhor errar esperando: se ele quiser seguir, ele fala.
 */
const QUER_FECHAR =
  /\b(?:vou|quero|vamos|bora|pode|podemos)\s+(?:fechar|contratar|ativar)\b|\bfechar\s+(?:com|o|no|essa|isso)\b|\bfechado\b|\bvamo(?:s)?\s+nessa\b|\bcomo\s+(?:eu\s+)?fa(?:ç|c)o\s+pra\s+(?:fechar|contratar|ativar)\b|\bpode\s+(?:dar\s+sequ(?:ê|e)ncia|seguir|prosseguir)\b|\bquero\s+(?:fazer|come(?:ç|c)ar)\s+(?:a\s+)?(?:ativa(?:ç|c)(?:ã|a)o|contrato)\b/i

/**
 * "caso eu for fechar com voces eu entro em contato" NAO e fechar: e adiar. Dono, 15/09/2026:
 * "se ele falou que entra em contato vc nao tinha que pedir doc pra ele". O verbo sob condicional
 * (se / caso / quando / assim que) e o "eu te chamo depois" viram espera, nunca pedido de documento.
 */
const FECHAR_CONDICIONAL = /\b(se|caso|quando|assim que|talvez)\b[^.?!\n]{0,24}\b(fechar|contratar|ativar)\b/i
const ELE_QUE_VAI_CHAMAR =
  /\b(entro|entrarei|entramos)\s+em\s+contato\b|\bte\s+(chamo|aviso|falo|retorno)\b|\bqualquer\s+coisa\s+(eu\s+)?(chamo|falo|aviso)\b|\bdepois\s+(eu\s+)?(falo|chamo|vejo|retorno)\b/i

export function querFechar(texto: string | null | undefined): boolean {
  const t = texto || ''
  if (FECHAR_CONDICIONAL.test(t) || ELE_QUE_VAI_CHAMAR.test(t)) return false
  // "optei por fechar com a Alamo" tem "fechar com" e NAO e fechar com a gente (dono, 29/09/2026)
  if (fechouComOutra(t)) return false
  return QUER_FECHAR.test(t)
}

/**
 * Cliente quente, querendo fechar: volta pra URGENTE mesmo que alguem tenha dado baixa ou posto
 * etiqueta (dono, 29/09/2026: "todos que vc achar que esta quente querendo fechar, enviou doc algo
 * assim vai pro urgente").
 */
export function sinalDeFechamento(p: { texto: string; mandouArquivo: boolean; tocouQueroSeguir: boolean }): boolean {
  return p.tocouQueroSeguir || p.mandouArquivo || querFechar(p.texto) || escolheuPlano(p.texto)
}

/** `comemorar` = false quando a IA acabou de responder (ela ja comemorou; duas vezes soa robo). */
export function mensagemPedidoDocumentos(
  comemorar = true,
  faltam: string[] = ['a foto da CNH', 'o documento do veículo', 'um comprovante de residência'],
  // quem finaliza: Leticya na Isa, Gabriel na Mariana
  h: Pick<HumanoDoBot, 'nome' | 'genero'> = { nome: 'Leticya', genero: 'f' },
): string {
  // Dono (12/09/2026): o que ele ja mandou no comeco nao se pede de novo.
  const lista = faltam.length > 1 ? `${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}` : faltam[0]
  const pedido = faltam.length
    ? `pra darmos sequência na sua ativação, me manda por aqui: ${lista}`
    : `já tenho seus documentos aqui, então vou te passar pr${h.genero === 'f' ? 'a' : 'o'} ${h.nome} finalizar a sua ativação`
  return comemorar ? `que ótimo! 🥳\n\n${pedido}` : pedido
}

/**
 * A placa destas mensagens ja foi cotada? Entao nao cota de novo.
 *
 * Loop de 16/09/2026 (Carlos, EES5918): a mensagem automatica do site traz a placa E uma duvida
 * ("fiz uma simulacao e fiquei com uma duvida"). Depois de cotar, a Isa deixa a mensagem pendente
 * pra responder a duvida na rodada seguinte — e na rodada seguinte achava a placa de novo e cotava
 * de novo. 14 simulacoes em 6 minutos, ate o cliente mandar audio reclamando.
 *
 * Placa reenviada DEPOIS da cotacao continua cotando (dono, 14/09/2026): so pula quando a cotacao e
 * mais nova que a ultima mensagem dele.
 */
export function jaCotouEssaPlaca(
  placa: string,
  ultimoOrcamento: { placa: string | null; em: string } | null,
  ultimaMensagemDeleEm: string | null,
): boolean {
  if (!ultimoOrcamento || !ultimaMensagemDeleEm) return false
  if ((ultimoOrcamento.placa || '').toUpperCase() !== placa.toUpperCase()) return false
  return new Date(ultimoOrcamento.em).getTime() >= new Date(ultimaMensagemDeleEm).getTime()
}

/**
 * BYD: todo, sem excecao, e atendido no contato da Leticya (4824), nunca pela Isa. Dono, 16/09/2026:
 * "todos byd sem excecao vai cair no outro contato da leticya". O site ja dispara texto + PDF de BYD
 * pelo 4824 (BYD_AUTO_DISPATCH).
 */
export function ehByd(marca: string | null | undefined): boolean {
  return (marca || '').trim().toUpperCase().startsWith('BYD')
}

/**
 * A placa veio do CRLV que ele mandou, e e a MESMA do veiculo que ele ja simulou no site: nao se
 * cota de novo nem se pergunta leilao/aplicativo outra vez (dono, 26/09/2026 — o Pedro tinha
 * preenchido tudo no site, mandou o documento e a Isa recomecou a cotacao do zero).
 *
 * Placa DIGITADA por ele continua valendo como pedido de cotacao, mesmo sendo a mesma: e a regra
 * de 14/09/2026 (Guilherme reenviou a placa pedindo a cotacao certa e a Isa so prometeu).
 */
export function recotarEssaPlaca(p: {
  placa: string | null
  soVeioDeDocumento: boolean
  placaDoLead: string | null | undefined
  leadJaTemCotacao: boolean
}): boolean {
  if (!p.placa) return false
  if (!p.soVeioDeDocumento) return true
  const mesma = (p.placaDoLead || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === p.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return !(mesma && p.leadJaTemCotacao)
}

/**
 * "Nao to conseguindo abrir o PDF", "manda de novo": a Isa REENVIA o arquivo (dono, 26/09/2026 —
 * ela respondeu "eu te passo tudo por aqui mesmo" e escreveu o plano inteiro no texto). So se o
 * reenvio falhar e que ela escreve os valores.
 */
export function pediuPdfDeNovo(texto: string | null | undefined): boolean {
  const t = (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (!t) return false
  const falaDoPdf = /\b(pdf|simulacao|cotacao|orcamento|arquivo|documento da simulacao)\b/.test(t)
  const naoAbre = /(nao (to|tou|estou|consigo|consegui|da pra|abre|abriu|carrega)|nao abre|nao abriu|nao consigo (abrir|ver|baixar)|nao consegui (abrir|ver|baixar)|erro ao abrir|nao ta abrindo|nao to conseguindo)/.test(t)
  const pedeDeNovo =
    /\b(reenvia|reenviar|reenvie|manda de novo|mandar de novo|envia de novo|enviar de novo)\b/.test(t) ||
    /(manda|mandar|envia|enviar|passa|passar|poderia (me )?(mandar|enviar))[^.?!]{0,30}(de novo|novamente|outra vez|de volta)/.test(t) ||
    /(de novo|novamente)[^.?!]{0,20}(pdf|simulacao|cotacao)/.test(t)
  return falaDoPdf && (naoAbre || pedeDeNovo)
}

/**
 * Ele fechou com OUTRA empresa (ou desistiu). Dono, 29/09/2026: o cliente escreveu "optei por
 * fechar com a Alamo pq me trouxe condições melhores" e a Isa pediu CNH, documento e comprovante
 * — o "fechar com" bateu na regra de quem quer contratar. *"vc só deveria agradecer e falar
 * qualquer coisa se precisa me chame"*.
 */
// Verbo de FECHAMENTO, nunca "fiquei na duvida" — em 01/10/2026 a Aline perguntou "fiquei na
// duvida sobre o rastreador" e a Isa respondeu "obrigada por avisar", como se ela tivesse
// desistido. O "fiquei/vou ficar" so vale com empresa logo depois ("fiquei com a Porto").
const FECHOU_COM_OUTRA =
  /\b(fechei|assinei|contratei)\b[^.?!\n]{0,30}\b(com|na|no|pela|pelo)\s+(?:a\s+|o\s+)?(?!voc|vcs|21|d[uú]vida)[a-zà-ú]/i

export function fechouComOutra(texto: string | null | undefined): boolean {
  const t = (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(com|pela|pelo)\s+(voces|vcs|21\s*go|21go|a\s+21)/i.test(t)) return false
  // duvida/pergunta no meio nunca e desistencia
  if (/\bduvida\b|\?/.test(t)) return false
  return (
    FECHOU_COM_OUTRA.test(t) ||
    /\b(optei|decidi|resolvi|preferi)\b[^.?!\n]{0,30}\b(fechar|ficar|seguir|continuar)\b/i.test(t) ||
    /\b(vou ficar|fiquei)\s+com\s+(?:a|o)\s+(?!voc|vcs|21)[a-z]/i.test(t) ||
    /\b(nao vou|desisti|ja fechei)\b[^.?!\n]{0,30}\b(seguir|contratar|fechar|fazer)\b/i.test(t)
  )
}

/** Ele avisou que fechou com outra: agradece e fica à disposição. Nada de documento nem venda. */
export function mensagemFechouComOutra(): string {
  return 'imagina, obrigada por avisar 🙏🏼\n\nqualquer coisa que precisar, é só me chamar por aqui'
}

/**
 * Scooter, bike e moto elétrica: a Isa não cota, passa o contato da Leticya (dono, 02/10/2026:
 * "toda vez que falar de scooter ou moto ou bike elétrica encaminhar o telefone da leticya").
 * O Power não tem essas versões, e ela ficava num "não achei esse modelo aqui" sem saída.
 */
const ELETRICO_LEVE =
  /\b(scooter|patinete|ciclomotor|triciclo)\b|\b(bike|bicicleta|moto|motoca|moped)\b[^.?!\n]{0,12}\b(eletric|elétric)/i

export function ehEletricoLeve(texto: string | null | undefined): boolean {
  const t = (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ELETRICO_LEVE.test(t) || /\b(eletric|elétric)[a-z]*\b[^.?!\n]{0,12}\b(bike|bicicleta|scooter|moto)\b/i.test(t)
}

/** O contato da supervisora, no texto do dono. O número sai do código, nunca da IA. */
export function mensagemEletricoLeve(
  humano: { nome: string; genero: 'f' | 'm'; telefoneCurto: string },
  nomeDoBot = 'Isa',
): string {
  const f = humano.genero === 'f'
  return (
    `esse tipo de veículo quem cuida é ${f ? 'a minha supervisora' : 'o meu supervisor'} 🙏🏼\n\n` +
    `o contato ${f ? 'dela' : 'dele'} é ${humano.nome.toLowerCase()}, ${humano.telefoneCurto}\n\n` +
    `é só falar que estava falando comigo, a ${nomeDoBot.toLowerCase()}, e que eu te passei o contato`
  )
}
