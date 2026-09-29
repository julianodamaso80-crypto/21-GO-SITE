import 'server-only'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { mensagensDoNumero } from '@/lib/whatsapp-cloud'
import {
  reivindicarPendentes,
  liberar,
  soltarSemProcessar,
  chegouMensagemNova,
  inboundsNovas,
  historico,
  gravarLeitura,
  registrarEvento,
  atualizarContato,
  contatosParaRetomar,
  reiniciarContato,
  humanoFalouDepois,
  textosLidos,
  adiarRetomada,
  jaPediuDocumentos,
  ultimaConsultaFoiRecusa,
  marcarConsultor,
  religarComJanelaFechada,
  sql,
  type ContatoIsa,
  type MensagemHistorico,
} from '@/lib/isa/banco'
import { pensar } from '@/lib/isa/cerebro'
import { transferir, pausarEAvisar, pedirDescontoAoDono, concederDesconto50, atenderDono, resumoDoCliente, descontoAutomaticoPendente } from '@/lib/isa/acoes'
import { alertarDono, alertarPergunta } from '@/lib/isa/alertas'
import { perguntaDeBeneficios, planoParaListar, mensagemBeneficios, mensagemQualPlano, valorQuePagaHoje, ehDespedida, mensagemRetomada, jaPerguntouProtecao, ehSoCumprimento, ehSoConcordancia, mensagemCumprimento, perguntouTudoBem, ehSoAgradecimento, mensagemAgradecimento } from '@/lib/isa/venda.regras'
import { entradaPopup, mensagemDesconto50, mensagemRobo, ehReiniciar, numeroDeTeste, numerosDeTeste, respostaDeSupervisor, AGUARDANDO_FECHA_QUANDO, mensagemTentarDesconto, mensagemVouFalarComSupervisor, mensagemTentarDeNovo, pediuAtivacaoGratis } from '@/lib/isa/dono.regras'
import { PAYLOAD_COBRE, PAYLOAD_DUVIDA, planoDoCliente, mensagemCobertura, mensagemDuvida } from '@/lib/isa/abordagem.regras'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import {
  enviarTexto,
  enviarArquivo,
  marcarLidaEDigitando,
  baixarMidia,
  destinoPermitido,
  numeroDeAlerta,
  EnvioBloqueado,
} from '@/lib/isa/cloud'
import { transcrever } from '@/lib/isa/transcrever'
import { lerMidia } from '@/lib/isa/ler-midia'
import { DOC_DE_FECHAMENTO, DOCS_CONTRATACAO, tipoDoTextoLido, docsQueFaltam, nomeDoDoc, formatoLegivel, textoDaLeitura, TAMANHO_MAXIMO, type Leitura, type TipoMidia } from '@/lib/isa/ler-midia.regras'
import { dividirEmPartes, partesComCitacao, citarMensagemRespondida, vistoDoLote, semMarcaDeParte, passaDoLimiteSemResposta, ehFalhaPassageira, pausaEntreSegundos, AUDIO_INAUDIVEL, ehInaudivel, mensagemAudioNaoEntendido, repeteMensagemRecente, type ParteEnvio } from '@/lib/isa/envio.regras'
import { cumprimento, dentroDoHorario, precisaCumprimentar } from '@/lib/isa/hora.regras'
import { abertura, falaDeAdesivo, ehPergunta, semCaraDeIa } from '@/lib/isa/prompt.regras'
import { mensagensDaSimulacao, mensagemNaoFazemos, mensagemPlacaNaoAchada, mensagemModeloSemPreco, escolheuPlano, querFechar, mensagemPedidoDocumentos, mensagemPerguntaLeilaoApp, lerLeilaoApp, ehPedidoDeSimulacao, jaCotouEssaPlaca, recotarEssaPlaca, pediuPdfDeNovo, ehByd } from '@/lib/isa/entrega.regras'
import { orcarPorPlaca, orcarPorModelo } from '@/lib/isa/orcamento'
import { acharMarca, filtrarVersoes, escolhaDoCliente, mensagemVersoes, mensagemDetalhe, MAX_OPCOES } from '@/lib/isa/versoes.regras'
import { placaNoTexto } from '@/lib/isa/placa.regras'
import { listBrandsPowerCrm, listModelsPowerCrm } from '@/lib/powercrm-lookup'
import { identifyPlate } from '@/lib/plate-identify'
import { isLeilaoOrigin } from '@/data/pricing'
import { recrutamentoNaIsa } from '@/lib/consultor-recrutamento'
import { promocaoDoContato, registrarRespostaPromo, marcarUrgente } from '@/lib/isa/promocao'
import { botaoDaPromocao, mensagemQueroSeguir, mensagemLinkDosPlanos, perguntaDeMensalidade, primeiroNomePromo, ehRespostaAutomatica } from '@/lib/isa/promocao.regras'

/**
 * A fila da Isa. Roda disparada pelo webhook (10,5 s depois da mensagem) e por um cron de 1 em
 * 1 minuto, que pega o que o webhook perdeu (deploy no meio, container reiniciado) e a fila das
 * 8h. O estado mora no banco — dois workers ao mesmo tempo nunca respondem o mesmo cliente.
 */

const SILENCIO_SEG = 10 // cliente parou de digitar: as mensagens picadas viram uma resposta so
const LOCK_SEG = 300
const LIMITE = 10

const dormir = (s: number) => new Promise((r) => setTimeout(r, Math.round(s * 1000)))

export interface ResultadoFila {
  processados: number
  respondidos: number
  foraDoHorario?: boolean
}

export async function processarFila(): Promise<ResultadoFila> {
  const agora = new Date()
  const noHorario = dentroDoHorario(agora)
  // Fora do horario so os numeros de teste do dono (ele testa 24 h); cliente espera as 8h.
  const teste = numerosDeTeste({ allowlist: process.env.ISA_ALLOWLIST, alerta: numeroDeAlerta() })
  if (!noHorario && teste.length === 0) return { processados: 0, respondidos: 0, foraDoHorario: true }
  if (noHorario) await retomarSumidos().catch((err) => console.error('[isa] retomada:', err))
  // Janela de 24 h fechada volta a conversa pro automatico (dono, 25/09/2026)
  await religarComJanelaFechada()
    .then(async (n) => { if (n > 0) await registrarEvento('sistema', 'religou_janela_fechada', { contatos: n }, 'sistema') })
    .catch((err) => console.error('[isa] religar janela fechada:', err))

  const contatos = await reivindicarPendentes({
    silencioSeg: SILENCIO_SEG,
    lockSeg: LOCK_SEG,
    limite: LIMITE,
    somente: noHorario ? null : teste,
  })
  const resultados = await Promise.all(contatos.map((c) => atender(c).catch(async (err) => {
    console.error('[isa] erro atendendo', c.telefone.slice(0, 6), err)
    await registrarEvento(c.telefone, 'erro', { mensagem: err instanceof Error ? err.message : String(err) }, 'sistema')
    await liberar(c.telefone, c.ultimo_inbound_em, false).catch(() => {})
    return false
  })))
  return {
    processados: contatos.length,
    respondidos: resultados.filter(Boolean).length,
    ...(noHorario ? {} : { foraDoHorario: true }),
  }
}

/**
 * FORA DO HORARIO ELA FICA MUDA. Aqui havia um aviso ("nosso atendimento e das 8h as 22h"), que
 * chegou a sair pra 4 clientes. Dono, 15/09/2026: "se o associado mandar mensagem e vc tiver fora
 * do horario vc nao vai responder nada, vai ficar muda, e qd der seu horario de comecar vc vai dar
 * bom dia e vai responder oq ele perguntou... humano nao avisa que horario e tal, ele atende ou
 * nao atende".
 *
 * A mensagem dele nao se perde: soltarSemProcessar solta a trava sem mexer no processado_ate,
 * entao as 7h a fila pega a conversa e responde, com o cumprimento da hora certa.
 */

const ADIAR_DESPEDIDA_MS = 20 * 60 * 60 * 1000

/**
 * Uma retomada por silencio, so pra quem ja recebeu cotacao (ver contatosParaRetomar). A mensagem
 * e a do MOMENTO dele (venda.regras mensagemRetomada): quem escolheu plano ouve dos documentos, quem
 * ja respondeu "tem protecao?" nao ouve de novo, quem se despediu so e chamado no dia seguinte.
 */
async function retomarSumidos(): Promise<void> {
  for (const c of await contatosParaRetomar()) {
    if (!destinoPermitido(c.telefone)) continue
    // Recusou o veiculo: nao ha o que retomar. contatosParaRetomar ja marcou retomada_em, entao
    // ele nao volta pra fila a cada minuto.
    if (await ultimaConsultaFoiRecusa(c.telefone, c.reiniciada_em)) {
      await registrarEvento(c.telefone, 'retomada_pulada', { motivo: 'nao_fazemos' })
      continue
    }
    const hist = await historico(c.conversation_id as string, 30, c.reiniciada_em)
    const ultimaDele = [...hist].reverse().find((m) => m.direction === 'inbound')
    const despediuSe = !!ultimaDele && ehDespedida(ultimaDele.content)
    const faz = c.ultima_resposta_em ? Date.now() - new Date(c.ultima_resposta_em).getTime() : Infinity
    if (despediuSe && faz < ADIAR_DESPEDIDA_MS) {
      await adiarRetomada(c.telefone, new Date(new Date(c.ultima_resposta_em as string).getTime() + ADIAR_DESPEDIDA_MS))
      await registrarEvento(c.telefone, 'retomada_adiada', { motivo: 'despedida' })
      continue
    }
    const lead = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
    const planos = lead ? fatosDoLead(lead, null).planos : []
    const texto = mensagemRetomada({
      escolheuPlano: await jaPediuDocumentos(c.telefone, c.reiniciada_em),
      jaPerguntouProtecao: jaPerguntouProtecao(hist),
      planoUnico: planos.length === 1 ? planos[0].nome : null,
      planoSugerido: planos.length > 1 ? (() => { const p = planoDoCliente(planos, null); return p ? { nome: p.nome, mensal: p.mensal } : null })() : null,
      despediuSe,
    })
    const agora = new Date()
    // O nome vai SO na abertura (12/09/2026 13:43 saiu "boa tarde, Leticya 😃 / Leticya, hoje...").
    const ab = precisaCumprimentar(c.ultima_resposta_em ? new Date(c.ultima_resposta_em) : null, agora)
      ? `${abertura(cumprimento(agora), primeiroNomeDe(c.nome))}\n\n`
      : ''
    const enviou = await enviarComoGente(c, `${ab}${texto}`, undefined, c.ultimo_inbound_em)
    await registrarEvento(c.telefone, 'retomada', { enviou, texto })
    if (enviou) await liberar(c.telefone, null, true)
  }
}

/**
 * Ate 3 tentativas, esperando 3 s e depois 6 s, so quando a falha e passageira. Sem isso uma
 * indisponibilidade de segundos da Meta virava cliente sem resposta: o liberar() marca a mensagem
 * como tratada mesmo quando o envio falhou.
 */
async function comRetentativa<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof EnvioBloqueado || tentativa >= 3 || !ehFalhaPassageira(msg)) throw err
      await dormir(tentativa * 3)
    }
  }
}

/** Devolve true se respondeu o cliente. */
async function atender(c: ContatoIsa): Promise<boolean> {
  let visto = c.ultimo_inbound_em
  if (!c.conversation_id) {
    await liberar(c.telefone, visto, false)
    return false
  }

  const novas = await inboundsNovas(c.conversation_id, c.processado_ate)
  // O que entrou NESTA resposta ja foi lido. Sem isto a propria mensagem do lote contava como
  // "chegou mensagem nova" e cortava o envio na 1a parte (dono, 25/09/2026).
  visto = vistoDoLote(visto, novas)
  // Sem mensagem nova nao ha o que responder. Sem esta guarda a IA era chamada com a conversa
  // inteira e inventava: "nao chegou outra pergunta aqui pra mim, pode mandar de novo?" (Pedro,
  // 23/09/2026) — e a pergunta dele estava na tela.
  if (novas.length === 0) {
    await liberar(c.telefone, visto, false)
    return false
  }
  await transcreverAudios(novas)

  // Numeros de teste do dono: "/reiniciar" zera a conversa — a Isa esquece o que veio antes (as
  // mensagens continuam no painel). Cliente de verdade nunca reinicia.
  const iReiniciar = novas.map((m) => ehReiniciar(m.content)).lastIndexOf(true)
  if (iReiniciar >= 0 && numeroDeTeste(c.telefone, { allowlist: process.env.ISA_ALLOWLIST, alerta: numeroDeAlerta() })) {
    const aviso = '🔄 conversa de teste reiniciada — pode começar do zero'
    await enviarComoGente(c, [aviso], novas[iReiniciar].whatsapp_message_id, visto, 'sistema')
    await reiniciarContato(c.telefone)
    await registrarEvento(c.telefone, 'reiniciou', null, 'dono')
    await liberar(c.telefone, visto, false)
    return true
  }

  // O numero de alertas (4240) tambem testa como cliente. So fala como supervisor quando ha um
  // pedido de desconto esperando resposta ou quando toca num botao do alerta.
  if (c.telefone === numeroDeAlerta() && respostaDeSupervisor({ aguardandoDono: c.aguardando_dono, payloads: payloadsDe(novas) })) {
    await atenderDono(c, novas)
    await liberar(c.telefone, visto, false)
    return false
  }

  // Promocao de 40% na ativacao (dono, 29/09/2026). "Agora nao": ninguem responde e o contato
  // some do painel. Qualquer outra resposta vai pra aba URGENTE — antes do horario e da chave da
  // Isa, pra aparecer pro time na hora.
  const promo = await promocaoDoContato(c.telefone).catch(() => null)
  const botaoPromo = promo ? botaoDaPromocao(payloadsDe(novas), novas.map((m) => m.content ?? '')) : null
  if (promo && botaoPromo === 'agora_nao') {
    await registrarRespostaPromo(c.telefone, 'agora_nao')
    await atualizarContato(c.telefone, { ligada: false, pausa_por: 'promo', pausa_motivo: 'promoção: agora não', pausada_em: new Date().toISOString() })
    await registrarEvento(c.telefone, 'promo40_agora_nao', null)
    await liberar(c.telefone, visto, false)
    return false
  }
  // Robo do WhatsApp Business de quem recebeu ("Fulano agradece seu contato"): ninguem responde e
  // continua fora do painel (29/09/2026 — a Isa respondeu um desses na primeira leva).
  if (promo && !botaoPromo && !promo.resposta && ehRespostaAutomatica(novas.map((m) => m.content ?? ''))) {
    await registrarEvento(c.telefone, 'promo40_resposta_automatica', { texto: (novas[0]?.content ?? '').slice(0, 80) }, 'sistema')
    await liberar(c.telefone, visto, false)
    return false
  }
  if (promo) {
    // Disse "agora nao" e depois escreveu: voltou a conversar, a Isa volta junto.
    if (promo.resposta === 'agora_nao' && !c.ligada && c.pausa_por === 'promo') {
      await atualizarContato(c.telefone, { ligada: true, pausa_por: null, pausa_motivo: null, pausada_em: null })
      c.ligada = true
    }
    await registrarRespostaPromo(c.telefone, botaoPromo === 'seguir' ? 'seguir' : 'texto')
    await marcarUrgente(c.telefone)
  }

  if (!c.ligada) {
    await liberar(c.telefone, visto, false)
    return false
  }

  // Alguem do time respondeu depois da ultima mensagem do cliente: quem atende agora e a pessoa.
  // A Isa nao manda nada por cima; volta quando o cliente escrever de novo (dono, 11/09/2026).
  if (await humanoFalouDepois(c.telefone, visto)) {
    await liberar(c.telefone, visto, false)
    return false
  }

  // Modo teste: quem nao esta na allowlist fica gravado e sem resposta. Marca como processado
  // de proposito — quando a trava sair, a Isa nao responde mensagem de dias atras.
  if (!destinoPermitido(c.telefone)) {
    await registrarEvento(c.telefone, 'silenciado_modo_teste', { mensagens: novas.length }, 'sistema')
    await liberar(c.telefone, visto, false)
    return false
  }

  if (!dentroDoHorario(new Date()) && !numeroDeTeste(c.telefone, { allowlist: process.env.ISA_ALLOWLIST, alerta: numeroDeAlerta() })) {
    await soltarSemProcessar(c.telefone)
    return false
  }

  const agora = new Date()
  const ultimaInbound = novas[novas.length - 1]?.whatsapp_message_id

  // Promocao (dono, 29/09/2026): "Quero seguir" recebe o veiculo, o link com os planos e "qual plano
  // voce deseja contratar?" — os documentos a Isa pede quando ele escolher. Pergunta de mensalidade
  // recebe o link do PDF. A Isa SEGUE ligada.
  if (promo && (botaoPromo === 'seguir' || (!botaoPromo && perguntaDeMensalidade(novas.map((m) => m.content ?? '').join('\n'))))) {
    const leadPromo = await leadDoCliente(c.telefone, c.lead_id, null).catch(() => null)
    const link = leadPromo?.id ? `${SITE}/api/pdfs/${leadPromo.id}` : null
    if (botaoPromo === 'seguir' || link) {
      const texto =
        botaoPromo === 'seguir'
          ? mensagemQueroSeguir(primeiroNomePromo(c.nome ?? promo.nome), promo, link)
          : mensagemLinkDosPlanos(promo, link as string)
      const enviou = await enviarComoGente(c, [texto], ultimaInbound, visto)
      await registrarEvento(c.telefone, botaoPromo === 'seguir' ? 'promo40_seguir' : 'promo40_link_planos', { lead: leadPromo?.id ?? null })
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }

  // "Quero Ser Consultor" (dono, 21/09/2026): o formulario abre este numero, mas quem quer ser
  // consultor ouve o recado do recrutamento e NUNCA o atendimento de venda. Vai inteiro numa
  // mensagem, como era no 4824.
  const recrutamento = await recrutamentoNaIsa({
    telefone: c.telefone,
    nome: c.nome,
    novas: novas.map((m) => m.content),
    historico: (await historico(c.conversation_id, 30, c.reiniciada_em))
      .filter((m) => m.direction === 'inbound')
      .map((m) => m.content),
    enviar: (texto) => enviarComoGente(c, [texto], ultimaInbound, visto),
  })
  if (recrutamento) {
    await marcarConsultor(c.telefone)
    const enviou = recrutamento !== 'nada'
    await registrarEvento(c.telefone, 'recrutamento_consultor', { acao: recrutamento })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  const enviar = (partes: string[]) => enviarComoGente(c, partes, ultimaInbound, visto)

  // Todo BYD, sem excecao, e atendido no contato da Leticya (dono, 16/09/2026). A Isa nao cota, nao
  // negocia e nao da desconto: transfere na primeira mensagem.
  // Menos quem veio da promocao de 40%: a Isa segue o atendimento (dono, 29/09/2026 — o Bruno, BYD,
  // disse que tem Loovi e ouviu "quem cuida do seu BYD e a Leticya").
  const leadDoByd = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
  if (leadDoByd && ehByd(leadDoByd.marca_interesse) && !promo) {
    await transferir(c, 'byd', enviar)
    await liberar(c.telefone, visto, true)
    return true
  }

  // So chegou audio que nao deu pra entender: pede pra repetir, sem passar pela IA (ela
  // "entendia" o que nao foi dito — teste do dono de 11/09/2026).
  if (novas.length > 0 && novas.every((m) => m.content === AUDIO_INAUDIVEL)) {
    await registrarEvento(c.telefone, 'audio_inaudivel', { quantos: novas.length })
    const enviou = await enviarComoGente(c, [mensagemAudioNaoEntendido(await aberturaSePrecisa(c, agora))], ultimaInbound, visto)
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // Foto, print, PDF: a Isa le (dono, 11/09/2026). CNH, CRLV e comprovante = o cliente quer
  // fechar: transfere pro 4824 e pausa (regra de 10/09). Arquivo que nao deu pra ler tambem
  // transfere — e o que acontecia com todo arquivo antes da leitura existir.
  const midias = novas.filter((m) => m.message_type === 'document' || m.message_type === 'image')
  if (midias.length) {
    const leituras = await lerMidias(c, midias)
    // Fotos do amassado que a Isa pediu: quem avalia e a Leticya (dono, 12/09/2026).
    if (c.etiquetas?.includes('avaria')) {
      await transferir(c, 'avaria', enviar)
      await liberar(c.telefone, visto, true)
      return true
    }
    // Dono (12/09/2026): documento no COMECO (antes de escolher plano) e pra COTAR — a Isa le, a
    // placa do CRLV vira simulacao, CNH/comprovante ficam guardados. So transfere pro 4824 quando
    // ele esta FECHANDO: ja escolheu o plano (pedimos os documentos) ou esta escolhendo agora.
    const docsAgora = leituras.filter((l): l is Leitura => !!l && DOC_DE_FECHAMENTO.has(l.tipo))
    const ilegivel = leituras.some((l) => !l)
    if (docsAgora.length || ilegivel) {
      const textoAgora = novas.map((m) => m.content).join('\n')
      const fechando =
        !ehPedidoDeSimulacao(textoAgora) &&
        ((await jaPediuDocumentos(c.telefone, c.reiniciada_em)) || escolheuPlano(textoAgora))
      if (fechando) {
        await transferir(c, 'documento', enviar)
        await liberar(c.telefone, visto, true)
        return true
      }
      if (ilegivel && !docsAgora.length) {
        const enviou = await enviarComoGente(c, ['não consegui abrir esse arquivo 🤔 pode mandar de novo como foto, por favor?'], ultimaInbound, visto)
        await liberar(c.telefone, visto, enviou)
        return enviou
      }
      await registrarEvento(c.telefone, 'documento_no_comeco', { tipos: docsAgora.map((l) => l.tipo) })
      // segue: a placa lida cai na cotacao logo abaixo; sem placa, a IA responde sabendo o que ja chegou
    }
  }

  // Entrada pelo popup ("Quero meu desconto!"): R$ 50 na ativacao, uma vez, com o antes e o depois.
  // Esta e a UNICA porta automatica do desconto (dono, 14/09/2026) — em todo o resto, quem quiser
  // desconto pede, e o pedido vai pro supervisor pelo gatilho "desconto".
  // Em QUALQUER mensagem pendente, nao so na primeira: no teste de 11/09/2026 havia uma mensagem
  // antiga na frente e o "Quero meu desconto" virou pedido de desconto comum (foi pro supervisor).
  const popup = novas.map((m) => entradaPopup(m.content ?? '')).find((p) => p.popup) ?? entradaPopup('')
  if (popup.popup && !c.desconto50_em) {
    await atualizarContato(c.telefone, { entrada: 'popup', ...(popup.leadId ? { lead_id: popup.leadId } : {}) })
    const d = await concederDesconto50(c, popup.leadId, popup.plano)
    if (d) {
      const ab = await aberturaSePrecisa(c, agora)
      const enviou = await enviarComoGente(c, `${ab ? `${ab}\n\n` : ''}${mensagemDesconto50(d)}`, ultimaInbound, visto)
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }

  // Toque num botao da mensagem dos 5 min: so a resposta montada pelo codigo (cobertura do plano
  // ou "qual a sua duvida?").
  // Aqui tambem saiam os R$ 50. Dono, 14/09/2026: "nao e pra vc dar desconto assim pra todo mundo,
  // so quando clica no quero desconto, fora isso vc vai ter uma conversa inteligente pra entender
  // o cliente e ver o que ele busca". Tocar em "cobre minha regiao?" nao e pedir desconto.
  const botao = payloadsDe(novas).find((p) => p === PAYLOAD_COBRE || p === PAYLOAD_DUVIDA)
  if (botao) {
    const lead5 = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
    const plano = lead5 ? planoDoCliente(fatosDoLead(lead5, null).planos, lead5.cotacao_plano ?? null) : null
    if (botao === PAYLOAD_DUVIDA || (lead5 && plano)) {
      const ab = await aberturaSePrecisa(c, agora)
      const partes = [
        botao === PAYLOAD_COBRE && lead5 && plano
          ? mensagemCobertura({ abertura: ab, plano, pdfUrl: `${SITE}/api/pdfs/${lead5.id}` })
          : mensagemDuvida(ab),
      ]
      await registrarEvento(c.telefone, 'botao_5min', { botao })
      const enviou = await enviarComoGente(c, partes, ultimaInbound, visto)
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }

  // Respondeu o numero da versao (cotacao sem placa): cota direto, sem passar pela IA.
  const ultimoTexto = novas[novas.length - 1]?.content ?? ''
  if (c.opcoes_versao?.itens?.length) {
    const i = escolhaDoCliente(ultimoTexto, c.opcoes_versao.itens.length)
    if (i !== null) {
      const o = c.opcoes_versao
      const item = o.itens[i]
      await atualizarContato(c.telefone, { opcoes_versao: null })
      const enviou = await cotarModeloEEnviar(c, {
        tipo: o.tipo, brandId: o.brandId, brandText: o.brandText, modelId: item.id, modelText: item.text,
        ano: o.ano, codFipe: item.back, ultimaInbound, visto,
      })
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }

  const lead = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
  if (lead && lead.id !== c.lead_id) await atualizarContato(c.telefone, { lead_id: lead.id })
  // Quem recebeu a promocao: a ativacao que vale e a dela, acima de qualquer outro desconto.
  const desconto = promo
    ? { de: promo.valorAnterior, para: promo.valorNovo }
    : c.desconto50_em && c.desconto50_de && c.desconto50_para
      ? { de: Number(c.desconto50_de), para: Number(c.desconto50_para) }
      : null
  const fatos = lead ? fatosDoLead(lead, desconto) : null

  const hist = await historico(c.conversation_id, 30, c.reiniciada_em)
  const ultimaNossa = [...hist].reverse().find((m) => m.direction === 'outbound')
  // Documentos de contratacao que ele ja mandou (dono, 12/09/2026: nao pedir de novo o que ja tem).
  const recebidos = new Set<TipoMidia>((await textosLidos(c.conversation_id, c.reiniciada_em)).map(tipoDoTextoLido).filter((t): t is TipoMidia => !!t))
  const docsDaConversa = { recebidos: [...recebidos].map(nomeDoDoc), faltam: docsQueFaltam(recebidos) }

  // PLACA E ACHADA PELO CODIGO, nunca pela IA (bug de 11/09/2026: "Pyv8i13" virou um HB20 inventado,
  // sem consulta, sem lead no Power e sem PDF). Placa nova na mensagem = consulta direto.
  const placaDita = placaNoTexto(novas.map((m) => m.content).join('\n'))
  // Placa que so aparece na leitura de um documento nao e pedido de cotacao: o texto e nosso, nao
  // dele. Se for a mesma do veiculo que ele ja simulou, segue a conversa sem recotar.
  const soVeioDeDocumento = !!placaDita && !placaNoTexto(novas.filter((m) => m.message_type === 'text').map((m) => m.content).join(' '))
  // Boleto, comprovante de residencia e fatura da protecao antiga TEM placa no texto e nao sao
  // pedido de cotacao (dono, 28/09/2026 — o Yuri mandou o boleto da APVS e a Isa cotou de novo, a
  // 3a vez no mesmo veiculo). So o CRLV, ou a placa DIGITADA por ele, mandam cotar.
  const placaDeDocQueNaoCota =
    soVeioDeDocumento &&
    !novas.some((m) => m.message_type !== 'text' && tipoDoTextoLido(m.content) === 'crlv' && placaNoTexto(m.content || ''))
  const textoNovas = novas.map((m) => m.content).join('\n')
  const cumprimentarAgora = precisaCumprimentar(ultimaNossa ? new Date(ultimaNossa.criada_em) : null, agora)
  // Placa que o CLIENTE digitou e SEMPRE pedido de cotacao, mesmo sendo a mesma de antes. Aqui
  // havia um `placaDita !== placaDoLead` que pulava a cotacao quando a placa ja estava no lead:
  // em 14/09/2026 o Guilherme reenviou a mesma placa pedindo a cotacao do carro certo, a mensagem
  // caiu na IA e ela prometeu ("ja puxo a simulacao") sem cotar nada, e ainda inventou "assim que
  // o sistema carregar". Dono: "era so vc ter feito a cotacao normal do veiculo, nao sei pq foi
  // inventar... vai seguir mesmo padrao, pergunta se tem leilao e se roda em app e faz a cotacao".
  // A placa destas mensagens ja foi cotada nesta leva (ficou pendente so a duvida que veio junto):
  // segue pra IA responder a duvida em vez de cotar de novo — ver jaCotouEssaPlaca.
  const ultimoOrcamento = placaDita
    ? (await sql<{ placa: string | null; em: string }>(
        `SELECT detalhe->>'placa' AS placa, created_at AS em FROM public.isa_eventos
         WHERE telefone = $1 AND tipo = 'orcamento' ORDER BY created_at DESC LIMIT 1`,
        [c.telefone],
      ))[0] ?? null
    : null
  const recotar = recotarEssaPlaca({
    placa: placaDita,
    soVeioDeDocumento,
    placaDoLead: lead?.placa_interesse,
    leadJaTemCotacao: !!lead?.cotacao_planos?.length,
  })
  if (placaDita && recotar && !placaDeDocQueNaoCota && !jaCotouEssaPlaca(placaDita, ultimoOrcamento, visto)) {
    await registrarEvento(c.telefone, 'placa', { placa: placaDita, por: 'codigo' })
    // Dono (11/09/2026): chegou a placa, pergunta leilao e aplicativo juntos ANTES dos valores —
    // a nao ser que ele ja tenha dito na mesma mensagem.
    const dito = lerLeilaoApp(textoNovas)
    if (dito.leilao === null && dito.app === null) {
      const enviou = await perguntarLeilaoApp(c, placaDita, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, ultimaInbound, visto })
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
    const enviou = await cotarPlacaPendente(c, placaDita, dito, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, desconto: null, ultimaInbound, visto })
    await soltarComPerguntaPendente(c.telefone, textoNovas, visto, enviou)
    return enviou
  }

  // Respondeu a pergunta de leilao/aplicativo: cota a placa que estava esperando.
  if (c.placa_pendente) {
    const dito = lerLeilaoApp(textoNovas)
    if (dito.leilao !== null || dito.app !== null) {
      const enviou = await cotarPlacaPendente(c, c.placa_pendente, dito, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, desconto, ultimaInbound, visto })
      await soltarComPerguntaPendente(c.telefone, textoNovas, visto, enviou)
      return enviou
    }
  }
  // "oi" / "bom dia, tudo bem?" sozinho: resposta simpatica pelo codigo e PARA — sem placa, sem
  // cotacao (dono, 13/09/2026: "boa noite, Juliano, tudo bem? como posso ajudar? nao atropela").
  // Vale pro lote inteiro: "Oi" + "Boa noite" recebem UMA resposta, nunca uma por mensagem
  // (dono, 29/09/2026 — a Samarah levou tres mensagens seguidas as 7h).
  if (ehSoCumprimento(textoNovas) && c.aguardando_dono !== AGUARDANDO_FECHA_QUANDO) {
    const texto = mensagemCumprimento({
      cumprimento: cumprimento(agora),
      primeiroNome: primeiroNomeDe(c.nome ?? lead?.nome ?? null),
      eleJaPerguntouTudoBem: perguntouTudoBem(textoNovas),
      cumprimentar: cumprimentarAgora,
    })
    await registrarEvento(c.telefone, 'cumprimento', { por: 'codigo' })
    const enviou = await enviarComoGente(c, [texto], ultimaInbound, visto)
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // "entendi" / "certo" / "ok" sozinho: ele so confirmou o que voce disse, entao a Isa NAO responde
  // (dono, 26/09/2026: "cara manda entendi, vc tem q ficar quieto" — ela respondia "me diz, como
  // posso te ajudar?"). Pergunta junto na mesma leva nao cai aqui: ehSoConcordancia exige que a
  // mensagem inteira seja a confirmacao.
  if (ehSoConcordancia(textoNovas) && c.aguardando_dono !== AGUARDANDO_FECHA_QUANDO) {
    await registrarEvento(c.telefone, 'concordou', { por: 'codigo', texto: textoNovas.slice(0, 40) })
    await liberar(c.telefone, visto, false)
    return false
  }

  // "obrigado" / "valeu, tchau" sozinho: uma linha e PARA. Dono (14/09/2026): "cliente ja
  // agradeceu, nao inventa" — a Isa agradecia de volta e emendava "me diz, como posso te ajudar?",
  // reabrindo a conversa que ela mesma tinha fechado. Depois do "oi" de proposito: "bom dia" e
  // cumprimento, nao despedida.
  if (novas.length === 1 && ehSoAgradecimento(textoNovas) && c.aguardando_dono !== AGUARDANDO_FECHA_QUANDO) {
    await registrarEvento(c.telefone, 'agradecimento', { por: 'codigo' })
    const enviou = await enviarComoGente(c, [mensagemAgradecimento()], ultimaInbound, visto)
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // "Não tô conseguindo abrir o PDF, manda de novo": ela REENVIA o arquivo (dono, 26/09/2026 — a
  // Isa respondeu "eu te passo tudo por aqui mesmo" e digitou o plano inteiro). Só se o reenvio
  // falhar é que a conversa segue pra IA, que aí sim escreve os valores.
  if (lead?.id && pediuPdfDeNovo(textoNovas)) {
    const reenviou = await reenviarPdf(c, lead.id, ultimaInbound)
    if (reenviou) {
      await liberar(c.telefone, visto, true)
      return true
    }
  }

  // Protocolo do desconto (dono, 12/09/2026), etapa 2: a Isa perguntou "se eu conseguir, você
  // pretende fechar quando?" e ele respondeu — a resposta vai no aviso pro supervisor e ela pausa.
  //
  // Mas se em vez de responder ele PERGUNTOU ("Danos a terceiros como funciona", "Tem cota?"),
  // isso nao e o "quando": antes, as duas perguntas eram descartadas e ela so dizia "vou falar
  // com ele" (dono, 14/09/2026: "ela viajou mt, nao respondeu dano a terceiro"). Agora a pergunta
  // cai no caminho normal, ela responde, e o protocolo segue esperando o "quando".
  // Dono, 16/09/2026: a Isa nao pausa mais nem espera o dono aqui. Diz que vai falar com o supervisor
  // e o cron volta sozinho em 6 min com o desconto (desconto-auto.ts).
  if (c.aguardando_dono === AGUARDANDO_FECHA_QUANDO && !ehPergunta(textoNovas)) {
    const enviou = await enviarComoGente(c, [mensagemVouFalarComSupervisor()], ultimaInbound, visto)
    await atualizarContato(c.telefone, { aguardando_dono: null })
    await registrarEvento(c.telefone, 'desconto', { tipo: 'vou_falar', quando: textoNovas.trim().slice(0, 120), gratis: pediuAtivacaoGratis(textoNovas) })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // "Quais os beneficios?" com simulacao na mao: a lista sai INTEIRA pelo codigo (auditoria de
  // 12/09/2026: a IA listou 5 de 17). Junto com outra pergunta, a IA responde tudo.
  if (fatos && lead) {
    const pb = perguntaDeBeneficios(textoNovas, novas.length)
    if (pb.pergunta) {
      const plano = planoParaListar(fatos.planos, pb.planoIds)
      const ab = cumprimentarAgora ? abertura(cumprimento(agora), primeiroNomeDe(c.nome ?? lead.nome ?? null)) : null
      const texto = plano
        ? mensagemBeneficios({ abertura: ab, plano, pdfUrl: `${SITE}/api/pdfs/${lead.id}`, temOutros: fatos.planos.length > 1 })
        : `${ab ? `${ab}\n\n` : ''}${mensagemQualPlano(fatos.planos)}`
      await registrarEvento(c.telefone, 'beneficios', { plano: plano?.id ?? null, por: 'codigo' })
      const enviou = await enviarComoGente(c, [texto], ultimaInbound, visto)
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }

  // Visto + "digitando" ANTES de pensar: o modelo leva alguns segundos e o cliente ve que tem alguem ali.
  if (ultimaInbound) await marcarLidaEDigitando(ultimaInbound)
  const saida = await pensar({
    nome: c.nome ?? lead?.nome ?? null,
    genero: (c.genero as 'm' | 'f' | null) ?? null,
    fatos,
    jaGanhouDesconto: !!c.desconto50_em || !!promo,
    promocao: promo,
    falaDeAdesivo: falaDeAdesivo(c.telefone),
    historico: hist,
    agora,
    cumprimentar: precisaCumprimentar(ultimaNossa ? new Date(ultimaNossa.criada_em) : null, agora),
    pagaHoje: valorQuePagaHoje(hist),
    docs: docsDaConversa,
  })

  if (saida.genero && !c.genero) await atualizarContato(c.telefone, { genero: saida.genero })
  if (saida.gatilho || saida.reprovados.length || saida.placa || saida.semPlaca) {
    await registrarEvento(c.telefone, 'cerebro', {
      gatilho: saida.gatilho,
      reprovados: saida.reprovados,
      placa: saida.placa,
      semPlaca: saida.semPlaca,
    })
  }

  // Associado (boleto, sinistro, reboque...): a Isa so vende — transfere pro 4824 e pausa.
  if (saida.gatilho === 'associado') {
    await transferir(c, 'associado', enviar)
    await liberar(c.telefone, visto, true)
    return true
  }

  // "Voce e robo?": o texto do dono + o link da Leticya, e a Isa SEGUE ligada (dono, 11/09/2026 —
  // calada, o cliente achava que a conversa tinha morrido). Se ele perguntou outra coisa junto,
  // essa resposta vai antes.
  if (saida.gatilho === 'robo') {
    const r = await resumoDoCliente(c)
    const robo = mensagemRobo({ genero: ((c.genero ?? saida.genero) as 'm' | 'f' | null) ?? null, resumo: r.texto })
    const ab = saida.resposta ? null : await aberturaSePrecisa(c, agora)
    const partes = saida.resposta ? [...dividirEmPartes(saida.resposta), robo] : [ab ? `${ab}\n\n${robo}` : robo]
    const enviou = await enviarComoGente(c, partes, ultimaInbound, visto)
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // Xingamento, numero que nao confere: a Isa fica calada e o dono e avisado.
  if (saida.gatilho && GATILHOS_SILENCIOSOS.has(saida.gatilho)) {
    const detalhe = saida.gatilho === 'validador' ? `numeros barrados: ${saida.reprovados.join(', ')}` : ultimoTexto.slice(0, 200)
    await pausarEAvisar(c, saida.gatilho, detalhe)
    await liberar(c.telefone, visto, false)
    return false
  }

  // Placa nova (ou o cliente corrigiu leilao/aplicativo): a Isa consulta e manda a simulacao.
  const placaAtual = (lead?.placa_interesse || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const leilaoAtual = lead ? isLeilaoOrigin(lead.leilao) : false
  const appAtual = !!lead?.carro_app
  const placaNova = saida.placa && saida.placa !== placaAtual ? saida.placa : null
  const pendente = c.placa_pendente
  const respondeu = saida.leilao !== null || saida.app !== null
  // Placa que so a IA achou e sem leilao/aplicativo: pergunta antes dos valores (dono, 11/09/2026).
  if (placaNova && !respondeu && placaNova !== pendente) {
    const enviou = await perguntarLeilaoApp(c, placaNova, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, ultimaInbound, visto })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }
  const alvo = respondeu ? (placaNova ?? pendente) : null
  if (alvo) {
    const enviou = await cotarPlacaPendente(c, alvo, { leilao: saida.leilao, app: saida.app }, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, desconto, ultimaInbound, visto })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }
  const corrigiu =
    !pendente &&
    !!placaAtual &&
    ((saida.leilao !== null && saida.leilao !== leilaoAtual) || (saida.app !== null && saida.app !== appAtual))
  if (corrigiu) {
    const enviouOrcamento = await orcarEEnviar(c, {
      placa: placaAtual,
      leilao: saida.leilao ?? leilaoAtual,
      app: saida.app ?? appAtual,
      assumido: false,
      nome: c.nome ?? lead?.nome ?? null,
      cumprimentar: cumprimentarAgora,
      desconto,
      ultimaInbound,
      visto,
    })
    await liberar(c.telefone, visto, enviouOrcamento)
    return enviouOrcamento
  }

  // Sem placa (zero km / nao sabe): lista as versoes do Power e o cliente escolhe.
  if (!saida.placa && saida.semPlaca?.ano && (saida.semPlaca.marca || saida.semPlaca.modelo)) {
    const enviou = await listarVersoesEEnviar(c, saida.semPlaca, {
      cumprimentar: precisaCumprimentar(ultimaNossa ? new Date(ultimaNossa.criada_em) : null, agora),
      nome: c.nome ?? lead?.nome ?? null,
      ultimaInbound,
      visto,
    })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // Varias perguntas juntas: cada parte sai citando a mensagem que ela responde. A ordem e a MESMA
  // que o cerebro numerou pra IA (as mensagens do cliente depois da ultima resposta da Isa).
  const iUltimaNossaNoHist = hist.map((m) => m.direction).lastIndexOf('outbound')
  const wamidsDasNovas = hist
    .slice(iUltimaNossaNoHist + 1)
    .filter((m) => m.direction === 'inbound' && (m.content || '').trim())
    .map((m) => m.whatsapp_message_id)
  // Protocolo do desconto, etapa 1 (ou 4, se ele ja ganhou um e pediu mais): a fala e do codigo,
  // no texto do dono; a IA so aponta o gatilho. Primeira vez: oferece tentar e pergunta quando
  // fecha (fica esperando a resposta, ligada). Ja teve desconto: "vou tentar de novo" e avisa ja.
  if (saida.gatilho === 'desconto') {
    const partes = saida.resposta ? dividirEmPartes(saida.resposta) : []
    if (c.desconto50_em) {
      const enviou = await enviarComoGente(c, [...partes, mensagemTentarDeNovo()], ultimaInbound, visto)
      await pedirDescontoAoDono(c, { quando: 'já tinha desconto e pediu mais' })
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
    if (await descontoAutomaticoPendente(c.telefone)) {
      const enviou = await enviarComoGente(c, [...partes, mensagemVouFalarComSupervisor()], ultimaInbound, visto)
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
    const enviou = await enviarComoGente(c, [...partes, mensagemTentarDesconto()], ultimaInbound, visto)
    await atualizarContato(c.telefone, { aguardando_dono: AGUARDANDO_FECHA_QUANDO })
    await registrarEvento(c.telefone, 'desconto', { tipo: 'perguntou_quando', gratis: pediuAtivacaoGratis(textoNovas) })
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  const enviou = saida.resposta
    ? await enviarComoGente(c, citarMensagemRespondida(partesComCitacao(saida.resposta, wamidsDasNovas), hist, agora), ultimaInbound, visto)
    : false

  // Ele disse que QUER SEGUIR e a resposta nao pediu os documentos: o proximo passo vai pelo
  // codigo. Antes bastava escolher o plano, e a Isa pedia CNH em cima de "completo de tudo"
  // (dono, 14/09/2026: "isso e ultima etapa"). Gostar do plano nao abre o pedido de documento.
  if (enviou && !saida.gatilho && querFechar(novas.map((m) => m.content).join('\n')) && !/\bcnh\b|comprovante/i.test(saida.resposta)) {
    if (docsDaConversa.faltam.length === 0) {
      // Ja mandou tudo no comeco "pra organizar": nao pede de novo — fecha com a Leticya.
      await transferir(c, 'documento', enviar)
      await liberar(c.telefone, visto, true)
      return true
    }
    await enviarComoGente(c, [mensagemPedidoDocumentos(false, docsDaConversa.faltam)], ultimaInbound, visto)
    await registrarEvento(c.telefone, 'pediu_documentos', { faltam: docsDaConversa.faltam })
  }

  // Aqui os R$ 50 saiam sozinhos pra quem respondeu a mensagem dos 5 min escrevendo qualquer
  // coisa. Dono, 14/09/2026 (print da Deiselane, que so disse que ia analisar e voltar depois):
  // "vc ofereceu desconto sem o cliente pedir". Desconto so quando ELE pede: pelo botao do popup,
  // pelo botao da mensagem dos 5 min ou pedindo na conversa (gatilho "desconto"). A mensagem dos
  // 5 min nunca prometeu o desconto, entao tirar daqui nao quebra promessa nenhuma.

  // Nao soube responder: respondeu "vou confirmar" e o dono fica sabendo (a Isa segue ligada).
  // Escolheu o plano mas nao tem comprovante de residencia: a Isa pede CNH + documento do veiculo
  // e o time e avisado (dono, 11/09/2026). Ela segue ligada.
  if (saida.gatilho === 'sem_comprovante') {
    await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'sem_comprovante', detalhe: ultimoTexto.slice(0, 200) })
  }
  // Pediu pra mudar o dia do vencimento: a Isa disse que vai tentar e o time e avisado (dono, 16/09/2026).
  if (saida.gatilho === 'mudar_vencimento') {
    await registrarEvento(c.telefone, 'mudar_vencimento', { texto: textoNovas.trim().slice(0, 200) })
    await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'mudar_vencimento', detalhe: textoNovas.trim().slice(0, 200) })
  }
  if (saida.gatilho === 'sem_informacao') {
    // A promessa "ja te retorno" vira pendencia: aparece em "Precisa de voce" e o dono responde
    // pelo WhatsApp — a Isa entrega ao cliente (acoes.responderPerguntaPendente).
    const pergunta = textoNovas.trim().slice(0, 300)
    await atualizarContato(c.telefone, { pergunta_pendente: { texto: pergunta, em: new Date().toISOString() } })
    await registrarEvento(c.telefone, 'sem_informacao', { pergunta })
    await alertarPergunta({ telefone: c.telefone, nome: c.nome, pergunta })
  }
  // Veiculo com amassado: a Isa pediu as fotos; a etiqueta faz a proxima foto ir pra Leticya.
  if (saida.gatilho === 'avaria' && !c.etiquetas?.includes('avaria')) {
    await sql(`UPDATE public.isa_contatos SET etiquetas = array_append(etiquetas, 'avaria'), updated_at = now() WHERE telefone = $1`, [c.telefone])
    await registrarEvento(c.telefone, 'avaria', { texto: ultimoTexto.slice(0, 120) })
  }

  await liberar(c.telefone, visto, enviou)
  return enviou
}

const GATILHOS_SILENCIOSOS = new Set(['hostil', 'associado', 'validador'])

const SITE = 'https://21go.site'

/**
 * Depois de cotar: se junto com a placa (ou com a resposta de leilao/aplicativo) ele perguntou
 * OUTRA coisa, as mensagens ficam pendentes de proposito — a rodada seguinte, um minuto depois,
 * responde a pergunta com a simulacao ja gravada. Dono, 12/09/2026: ele mandou "roda em app" e
 * "tem diferenca?" e so a simulacao saiu.
 */
async function soltarComPerguntaPendente(telefone: string, texto: string, visto: string | null, enviou: boolean): Promise<void> {
  const soAPlacaEaResposta = !ehPergunta(texto.replace(/\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/gi, ' '))
  await liberar(telefone, soAPlacaEaResposta ? visto : null, enviou)
}

/**
 * Reenvia o PDF da simulacao como ARQUIVO (dono, 26/09/2026: "qd falar que nao ta conseguindo ver
 * o PDF, vc enviar novamente o PDF"). O arquivo vem da nossa propria rota, que regenera do banco.
 * `false` quando nao deu: aí quem chama deixa a conversa seguir e a Isa escreve os valores.
 */
async function reenviarPdf(c: ContatoIsa, leadId: string, ultimaInbound: string | undefined): Promise<boolean> {
  try {
    const r = await fetch(`${SITE}/api/pdfs/${leadId}`, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`pdf ${r.status}`)
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length < 1000) throw new Error('pdf vazio')
    if (ultimaInbound) await marcarLidaEDigitando(ultimaInbound)
    const wamid = await enviarArquivo(c.telefone, bytes, {
      tipo: 'document',
      mime: 'application/pdf',
      nome: 'simulacao-21go.pdf',
      legenda: 'te mandei aqui de novo 🙏🏼',
    })
    await upsertMessage({
      conversation_id: c.conversation_id,
      whatsapp_message_id: wamid,
      evolution_instance: 'cloud_isa',
      jid: phoneToJid(c.telefone) ?? `${c.telefone}@s.whatsapp.net`,
      direction: 'outbound',
      status: 'SENT',
      sender: 'isa',
      message_type: 'document',
      content: 'simulacao-21go.pdf',
      sent_at: new Date().toISOString(),
    }).catch(() => {})
    await registrarEvento(c.telefone, 'pdf_reenviado', { lead: leadId })
    return true
  } catch (err) {
    await registrarEvento(c.telefone, 'pdf_reenvio_falhou', { erro: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/** Guarda a placa e pergunta leilao e aplicativo juntos, antes de passar valores. */
async function perguntarLeilaoApp(
  c: ContatoIsa,
  placa: string,
  p: { cumprimentar: boolean; nome: string | null; ultimaInbound: string | undefined; visto: string | null },
): Promise<boolean> {
  await atualizarContato(c.telefone, { placa_pendente: placa })
  await registrarEvento(c.telefone, 'perguntou_leilao_app', { placa })
  const ab = p.cumprimentar ? abertura(cumprimento(new Date()), primeiroNomeDe(p.nome)) : null
  return enviarComoGente(c, [mensagemPerguntaLeilaoApp(ab)], p.ultimaInbound, p.visto)
}

/** Cota a placa com o que o cliente respondeu. O que ele nao disse conta como "nao". */
async function cotarPlacaPendente(
  c: ContatoIsa,
  placa: string,
  dito: { leilao: boolean | null; app: boolean | null },
  p: { cumprimentar: boolean; nome: string | null; desconto: { de: number; para: number } | null; ultimaInbound: string | undefined; visto: string | null },
): Promise<boolean> {
  if (c.placa_pendente) await atualizarContato(c.telefone, { placa_pendente: null })
  return orcarEEnviar(c, {
    placa,
    leilao: dito.leilao ?? false,
    app: dito.app ?? false,
    assumido: false,
    nome: p.nome,
    cumprimentar: p.cumprimentar,
    desconto: p.desconto,
    ultimaInbound: p.ultimaInbound,
    visto: p.visto,
  })
}

/** "perai que vou consultar" → consulta → as 2 mensagens do dono (ou o motivo de nao fazermos). */
async function orcarEEnviar(
  c: ContatoIsa,
  p: {
    placa: string
    leilao: boolean
    app: boolean
    assumido: boolean
    nome: string | null
    cumprimentar: boolean
    desconto: { de: number; para: number } | null
    ultimaInbound: string | undefined
    visto: string | null
  },
): Promise<boolean> {
  const nome = primeiroNomeDe(p.nome)
  const ab = p.cumprimentar ? abertura(cumprimento(new Date()), nome) : null
  await enviarComoGente(c, [ab ? `${ab}\n\nperaí, que eu vou consultar aqui 🙏🏼` : 'peraí, que eu vou consultar aqui 🙏🏼'], p.ultimaInbound, p.visto)

  const orc = await orcarPorPlaca({ telefone: c.telefone, nome: p.nome, placa: p.placa, leilao: p.leilao, carroApp: p.app })
  await registrarEvento(c.telefone, 'orcamento', { placa: p.placa, resultado: orc.tipo, tabela: orc.tipo === 'ok' ? orc.tabela : undefined })

  if (orc.tipo === 'ok') {
    await atualizarContato(c.telefone, { lead_id: orc.lead.id, preco_da_tabela: orc.tabela })
    if (ehByd(orc.lead.marca_interesse)) {
      await transferir({ ...c, lead_id: orc.lead.id }, 'byd', (partes) => enviarComoGente(c, partes, p.ultimaInbound, p.visto))
      return true
    }
    const fatos = fatosDoLead(orc.lead, p.desconto)
    const partes = mensagensDaSimulacao({
      abertura: null,
      nome: orc.lead.nome || p.nome,
      fatos,
      pdfUrl: `${SITE}/api/pdfs/${orc.lead.id}`,
      leilaoOuAppAssumido: p.assumido,
    })
    return enviarComoGente(c, partes, p.ultimaInbound, p.visto)
  }
  if (orc.tipo === 'nao_fazemos') return enviarComoGente(c, [mensagemNaoFazemos(orc.motivo)], p.ultimaInbound, p.visto)
  if (orc.tipo === 'placa_invalida') {
    return enviarComoGente(c, ['essa placa não parece certa 🤔 confere pra mim, por favor?'], p.ultimaInbound, p.visto)
  }
  // Nenhuma fonte achou o veiculo nem a FIPE: a Isa nao chuta e NAO transfere (dono, 11/09/2026:
  // "quem faz a cotacao e voce"). Pede pra conferir a placa ou fazer pelo modelo; o dono e avisado.
  await registrarEvento(c.telefone, 'sem_preco', { placa: p.placa, motivo: orc.motivo })
  await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'sem_preco', detalhe: `placa ${p.placa}: ${orc.motivo}`.slice(0, 200) })
  // O que o DENATRAN mostra dessa placa (mesma identificacao da tela do site), pro cliente conferir.
  const id = await identifyPlate(p.placa).catch(() => null)
  const comoAparece = id && (id.status === 'found' || id.status === 'partial') && id.label ? id.label : null
  return enviarComoGente(c, [mensagemPlacaNaoAchada(comoAparece)], p.ultimaInbound, p.visto)
}

/** Acha a marca (carro, depois moto), filtra as versoes do ano e manda a lista numerada. */
async function listarVersoesEEnviar(
  c: ContatoIsa,
  sp: { marca: string | null; modelo: string; ano: number | null },
  p: { cumprimentar: boolean; nome: string | null; ultimaInbound: string | undefined; visto: string | null },
): Promise<boolean> {
  const ab = p.cumprimentar ? `${abertura(cumprimento(new Date()), primeiroNomeDe(p.nome))}\n\n` : ''
  const ano = sp.ano as number
  const marcaDita = sp.marca || sp.modelo.split(' ')[0]
  // Carro primeiro; se a marca nao existir ali OU nao tiver o modelo (Honda carro x Honda moto),
  // procura nas motos.
  let tipo: 'carro' | 'moto' = 'carro'
  let marca = acharMarca(await listBrandsPowerCrm('carro'), marcaDita)
  let opcoes = marca ? filtrarVersoes(await listModelsPowerCrm(marca.id, ano), sp.modelo) : []
  if (opcoes.length === 0) {
    const marcaMoto = acharMarca(await listBrandsPowerCrm('moto'), marcaDita)
    const opcoesMoto = marcaMoto ? filtrarVersoes(await listModelsPowerCrm(marcaMoto.id, ano), sp.modelo) : []
    if (opcoesMoto.length) {
      marca = marcaMoto
      opcoes = opcoesMoto
      tipo = 'moto'
    }
  }
  await registrarEvento(c.telefone, 'versoes', { marca: marca?.text ?? null, tipo, ano, modelo: sp.modelo, achadas: opcoes.length })

  if (!marca || opcoes.length === 0) {
    return enviarComoGente(
      c,
      [`${ab}não achei esse modelo aqui 🤔 me manda o nome completo, do jeito que está no documento, ou a placa, se já tiver`],
      p.ultimaInbound,
      p.visto,
    )
  }
  if (opcoes.length > MAX_OPCOES) {
    return enviarComoGente(c, [`${ab}${mensagemDetalhe(sp.modelo, ano)}`], p.ultimaInbound, p.visto)
  }
  if (opcoes.length === 1) {
    return cotarModeloEEnviar(c, {
      tipo, brandId: marca.id, brandText: marca.text, modelId: opcoes[0].id, modelText: opcoes[0].text,
      ano, codFipe: opcoes[0].back ?? null, ultimaInbound: p.ultimaInbound, visto: p.visto,
    })
  }
  await atualizarContato(c.telefone, {
    opcoes_versao: {
      tipo, brandId: marca.id, brandText: marca.text, ano, modeloDito: sp.modelo,
      itens: opcoes.map((o) => ({ id: o.id, text: o.text, back: o.back ?? null })),
    },
  })
  return enviarComoGente(c, [`${ab}${mensagemVersoes(sp.modelo, ano, opcoes)}`], p.ultimaInbound, p.visto)
}

async function cotarModeloEEnviar(
  c: ContatoIsa,
  p: {
    tipo: 'carro' | 'moto'; brandId: number; brandText: string; modelId: number; modelText: string
    ano: number; codFipe: string | null; ultimaInbound: string | undefined; visto: string | null
  },
): Promise<boolean> {
  await enviarComoGente(c, ['peraí, que eu vou consultar aqui 🙏🏼'], p.ultimaInbound, p.visto)
  const orc = await orcarPorModelo({
    telefone: c.telefone, nome: c.nome, tipo: p.tipo, brandId: p.brandId, brandText: p.brandText,
    modelId: p.modelId, modelText: p.modelText, ano: p.ano, codFipe: p.codFipe, leilao: false, carroApp: false,
  })
  await registrarEvento(c.telefone, 'orcamento', { modelo: p.modelText, ano: p.ano, resultado: orc.tipo })
  if (orc.tipo === 'ok') {
    await atualizarContato(c.telefone, { lead_id: orc.lead.id, preco_da_tabela: orc.tabela })
    if (ehByd(orc.lead.marca_interesse)) {
      await transferir({ ...c, lead_id: orc.lead.id }, 'byd', (partes) => enviarComoGente(c, partes, p.ultimaInbound, p.visto))
      return true
    }
    const partes = mensagensDaSimulacao({
      abertura: null,
      nome: orc.lead.nome || c.nome,
      fatos: fatosDoLead(orc.lead, null),
      pdfUrl: `${SITE}/api/pdfs/${orc.lead.id}`,
      leilaoOuAppAssumido: true,
    })
    return enviarComoGente(c, partes, p.ultimaInbound, p.visto)
  }
  if (orc.tipo === 'nao_fazemos') return enviarComoGente(c, [mensagemNaoFazemos(orc.motivo)], p.ultimaInbound, p.visto)
  const motivo = orc.tipo === 'humano' ? orc.motivo : orc.tipo
  await registrarEvento(c.telefone, 'sem_preco', { modelo: p.modelText, ano: p.ano, motivo })
  await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'sem_preco', detalhe: `${p.modelText} ${p.ano}: ${motivo}`.slice(0, 200) })
  return enviarComoGente(c, [mensagemModeloSemPreco()], p.ultimaInbound, p.visto)
}

/** "bom dia, Fulano 😃" quando a Isa ainda nao falou hoje (ou ha 4 h); senao null. */
async function aberturaSePrecisa(c: ContatoIsa, agora: Date): Promise<string | null> {
  const hist = await historico(c.conversation_id as string, 5, c.reiniciada_em)
  const nossa = [...hist].reverse().find((m) => m.direction === 'outbound')
  return precisaCumprimentar(nossa ? new Date(nossa.criada_em) : null, agora)
    ? abertura(cumprimento(agora), primeiroNomeDe(c.nome))
    : null
}

/** Payload dos botoes tocados (quick reply de template) — vem so no JSON cru da Meta. */
function payloadsDe(novas: MensagemHistorico[]): string[] {
  const phoneId = process.env.WA_PHONE_ID ?? ''
  return novas
    .filter((m) => m.message_type === 'button')
    .map((m) => mensagensDoNumero(m.raw_payload, phoneId).find((x) => x.id === m.whatsapp_message_id)?.payload ?? '')
    .filter(Boolean)
}

export function primeiroNomeDe(nome: string | null): string | null {
  const n = (nome || '').trim().split(/\s+/)[0]
  if (!n || n.length < 2) return null
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}


/** Le cada foto/PDF, troca o conteudo pelo que foi lido (banco e memoria) e devolve as leituras. */
async function lerMidias(c: ContatoIsa, midias: MensagemHistorico[]): Promise<(Leitura | null)[]> {
  const phoneId = process.env.WA_PHONE_ID ?? ''
  const out: (Leitura | null)[] = []
  for (const m of midias) {
    const original = mensagensDoNumero(m.raw_payload, phoneId).find((x) => x.id === m.whatsapp_message_id)
    const arquivo = original?.mediaId ? await baixarMidia(original.mediaId).catch(() => null) : null
    const formato = arquivo ? formatoLegivel(arquivo.mime) : null
    const leitura = arquivo && formato && arquivo.bytes.length <= TAMANHO_MAXIMO ? await lerMidia(arquivo.bytes, arquivo.mime, formato) : null
    if (leitura) {
      const texto = textoDaLeitura(original?.texto ?? null, leitura)
      await gravarLeitura(m.id, texto)
      m.content = texto
    }
    await registrarEvento(c.telefone, 'leitura', leitura ? { tipo: leitura.tipo, placa: leitura.placa } : { falhou: true, mime: arquivo?.mime ?? null })
    out.push(leitura)
  }
  return out
}

async function transcreverAudios(novas: MensagemHistorico[]): Promise<void> {
  const phoneId = process.env.WA_PHONE_ID ?? ''
  for (const m of novas) {
    if (m.message_type !== 'audio' || !m.content.startsWith('[')) continue
    const original = mensagensDoNumero(m.raw_payload, phoneId).find((x) => x.id === m.whatsapp_message_id)
    if (!original?.mediaId) continue
    const midia = await baixarMidia(original.mediaId)
    const texto = midia ? await transcrever(midia.bytes, midia.mime) : null
    // Cortado, sem fala, duvida do modelo ou falha: vira "nao deu pra entender" — nunca palpite.
    const conteudo = ehInaudivel(texto) ? AUDIO_INAUDIVEL : `🎤 ${texto}`
    await gravarLeitura(m.id, conteudo)
    m.content = conteudo
  }
}

/**
 * Tique azul → pausa curta → "digitando..." → partes, com pausa entre elas pela formula do
 * Parlant. Antes de cada parte confere se o cliente escreveu de novo: se escreveu, para e deixa a
 * proxima rodada responder lendo tudo — e o que uma pessoa faria.
 */
export async function enviarComoGente(
  c: ContatoIsa,
  texto: string | string[] | ParteEnvio[],
  ultimaInboundWamid: string | undefined,
  visto: string | null,
  sender = 'isa',
): Promise<boolean> {
  // Lista = partes ja montadas (a simulacao vai inteira numa mensagem); texto = divide na linha em branco.
  const montadas: ParteEnvio[] = (Array.isArray(texto) ? texto : dividirEmPartes(texto))
    .map((p) => (typeof p === 'string' ? { texto: p, citar: null } : p))
    // a marcacao [1], [2] e interna: nunca chega no cliente, venha de que caminho vier
    // Nem [n] nem travessao/aspas chegam no cliente, venha de onde vier: texto da IA, resposta
    // pronta ou mensagem do codigo. Em 16/09/2026 o travessao saiu de uma resposta PRONTA, que
    // o filtro antigo (so no texto da IA) deixava passar. Dono: "errando de novo".
    .map((p) => ({ ...p, texto: semCaraDeIa(semMarcaDeParte(p.texto)) }))
    .filter((p) => p.texto)
  if (montadas.length === 0) return false

  // Mesma mensagem nunca sai 2x SEGUIDAS (dono, 26/09/2026). Conta so o que saiu DEPOIS da ultima
  // mensagem dele: assim a Isa nunca repete sozinha (o loop que ele barrou), mas cliente que
  // escreveu de novo nunca fica sem resposta — em 28/09/2026 ele perguntou da filial de Sao
  // Goncalo, o "vou confirmar" era igual ao de antes, a trava segurou e ele ficou sem nada.
  const recentes = c.conversation_id
    ? (await sql<{ content: string | null }>(
        `SELECT content FROM public.messages
          WHERE conversation_id = $1 AND direction = 'outbound'
            AND created_at > now() - interval '24 hours'
            AND created_at > COALESCE((SELECT max(i.created_at) FROM public.messages i
                                       WHERE i.conversation_id = $1 AND i.direction = 'inbound'),
                                      '-infinity'::timestamptz)
          ORDER BY created_at DESC LIMIT 40`,
        [c.conversation_id],
      )).map((m) => m.content || '')
    : []
  const partes: ParteEnvio[] = []
  for (const p of montadas) {
    if (repeteMensagemRecente(p.texto, [...recentes, ...partes.map((x) => x.texto)])) continue
    partes.push(p)
  }
  if (partes.length < montadas.length) {
    await registrarEvento(c.telefone, 'repetida_segurada', { seguradas: montadas.length - partes.length, texto: montadas[0].texto.slice(0, 120) })
  }
  if (partes.length === 0) return false

  // Trava geral contra loop (ver passaDoLimiteSemResposta): conta o que a conversa ja recebeu desde
  // a ultima mensagem dele, nas ultimas 2 horas. Estourou: nao manda nada, pausa e avisa o dono.
  if (sender === 'isa') {
    const [r] = await sql<{ n: string }>(
      `SELECT count(*) AS n FROM public.messages m
       WHERE m.conversation_id = $1 AND m.evolution_instance = 'cloud_isa' AND m.direction = 'outbound'
         AND m.created_at > GREATEST(
           now() - interval '2 hours',
           COALESCE((SELECT max(i.created_at) FROM public.messages i
                     WHERE i.conversation_id = $1 AND i.evolution_instance = 'cloud_isa' AND i.direction = 'inbound'),
                    '-infinity'::timestamptz))`,
      [c.conversation_id],
    )
    const jaEnviadas = Number(r?.n ?? 0)
    if (passaDoLimiteSemResposta(jaEnviadas, partes.length)) {
      await registrarEvento(c.telefone, 'trava_loop', { jaEnviadas, ia_mandar: partes.length, texto: partes[0].texto.slice(0, 120) })
      await pausarEAvisar(c, 'loop', `a Isa ia mandar a ${jaEnviadas + 1}a mensagem sem o cliente responder — segurei, pausei e nada saiu. Confere a conversa.`)
      return false
    }
  }

  if (ultimaInboundWamid) await marcarLidaEDigitando(ultimaInboundWamid)
  await dormir(1 + Math.random())

  let enviadas = 0
  for (let i = 0; i < partes.length; i++) {
    if (i > 0 && (await chegouMensagemNova(c.telefone, visto))) {
      await registrarEvento(c.telefone, 'interrompida', { enviadas, total: partes.length })
      break
    }
    // Alguem do time escreveu enquanto a Isa preparava a resposta: a pessoa assume, sem mensagem por cima.
    if (sender === 'isa' && (await humanoFalouDepois(c.telefone, visto))) {
      await registrarEvento(c.telefone, 'interrompida', { enviadas, total: partes.length, por: 'humano' })
      break
    }
    // Desligaram a Isa enquanto ela preparava a resposta: nada sai (Renato, 21/09/2026 — a Leticya
    // desligou as 20:08:03 e a Isa ainda mandou as 20:08:05).
    if (sender === 'isa') {
      const [agoraLigada] = await sql<{ ligada: boolean }>(`SELECT ligada FROM public.isa_contatos WHERE telefone = $1`, [c.telefone])
      if (agoraLigada && !agoraLigada.ligada) {
        await registrarEvento(c.telefone, 'interrompida', { enviadas, total: partes.length, por: 'desligada' })
        break
      }
    }
    try {
      // Falha passageira da Meta ou da rede: tenta de novo antes de desistir (Rafael, 15/09/2026).
      const wamid = await comRetentativa(() => enviarTexto(c.telefone, partes[i].texto, partes[i].citar))
      enviadas++
      await upsertMessage({
        conversation_id: c.conversation_id,
        whatsapp_message_id: wamid,
        evolution_instance: 'cloud_isa',
        jid: phoneToJid(c.telefone) ?? `${c.telefone}@s.whatsapp.net`,
        direction: 'outbound',
        status: 'SENT',
        sender,
        message_type: 'text',
        content: partes[i].texto,
        sent_at: new Date().toISOString(),
        // mesma coisa pra citacao da Isa: sem gravar, o dono nao via que ela respondeu a mensagem certa
        raw_payload: partes[i].citar ? { context: { message_id: partes[i].citar } } : undefined,
      }).catch((err) => console.error('[isa] resposta enviada mas nao gravada:', err))
    } catch (err) {
      const bloqueado = err instanceof EnvioBloqueado
      await registrarEvento(c.telefone, bloqueado ? 'envio_bloqueado' : 'envio_falhou', {
        parte: i,
        erro: err instanceof Error ? err.message : String(err),
      })
      break
    }
    const proxima = partes[i + 1]
    if (proxima) {
      if (ultimaInboundWamid) await marcarLidaEDigitando(ultimaInboundWamid) // o indicador some em 25 s
      await dormir(pausaEntreSegundos(partes[i].texto, proxima.texto))
    }
  }
  return enviadas > 0
}
