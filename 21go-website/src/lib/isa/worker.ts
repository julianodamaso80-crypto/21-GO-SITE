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
  type ContatoIsa,
  type MensagemHistorico,
} from '@/lib/isa/banco'
import { pensar } from '@/lib/isa/cerebro'
import { transferir, pausarEAvisar, pedirDescontoAoDono, concederDesconto50, atenderDono, resumoDoCliente } from '@/lib/isa/acoes'
import { alertarDono } from '@/lib/isa/alertas'
import { entradaPopup, mensagemDesconto50, mensagemRobo, ehReiniciar, numeroDeTeste, numerosDeTeste, respostaDeSupervisor } from '@/lib/isa/dono.regras'
import { PAYLOAD_COBRE, PAYLOAD_DUVIDA, planoDoCliente, mensagemCobertura, mensagemDuvida } from '@/lib/isa/abordagem.regras'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import {
  enviarTexto,
  marcarLidaEDigitando,
  baixarMidia,
  destinoPermitido,
  numeroDeAlerta,
  EnvioBloqueado,
} from '@/lib/isa/cloud'
import { transcrever } from '@/lib/isa/transcrever'
import { lerMidia } from '@/lib/isa/ler-midia'
import { DOC_DE_FECHAMENTO, formatoLegivel, textoDaLeitura, TAMANHO_MAXIMO, type Leitura } from '@/lib/isa/ler-midia.regras'
import { dividirEmPartes, pausaEntreSegundos, AUDIO_INAUDIVEL, ehInaudivel, mensagemAudioNaoEntendido } from '@/lib/isa/envio.regras'
import { cumprimento, dentroDoHorario, precisaCumprimentar } from '@/lib/isa/hora.regras'
import { abertura, falaDeAdesivo } from '@/lib/isa/prompt.regras'
import { mensagensDaSimulacao, mensagemNaoFazemos, mensagemPlacaNaoAchada, mensagemModeloSemPreco, escolheuPlano, mensagemPedidoDocumentos, mensagemPerguntaLeilaoApp, lerLeilaoApp } from '@/lib/isa/entrega.regras'
import { orcarPorPlaca, orcarPorModelo } from '@/lib/isa/orcamento'
import { acharMarca, filtrarVersoes, escolhaDoCliente, mensagemVersoes, mensagemDetalhe, MAX_OPCOES } from '@/lib/isa/versoes.regras'
import { placaNoTexto } from '@/lib/isa/placa.regras'
import { listBrandsPowerCrm, listModelsPowerCrm } from '@/lib/powercrm-lookup'
import { identifyPlate } from '@/lib/plate-identify'
import { isLeilaoOrigin } from '@/data/pricing'

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

/** Uma retomada por silencio, so pra quem ja recebeu cotacao (ver contatosParaRetomar). */
async function retomarSumidos(): Promise<void> {
  for (const c of await contatosParaRetomar()) {
    if (!destinoPermitido(c.telefone)) continue
    // Dono (11/09/2026): conversa, nao cobranca — pergunta da situacao dele. O resto (quanto paga
    // hoje, qual dos nossos planos gostou mais) segue pela IA quando ele responder.
    const nome = primeiroNomeDe(c.nome)
    const agora = new Date()
    const ab = precisaCumprimentar(c.ultima_resposta_em ? new Date(c.ultima_resposta_em) : null, agora)
      ? `${abertura(cumprimento(agora), nome)}\n\n`
      : ''
    const texto = `${ab}${nome ? `${nome}, ` : ''}hoje você possui alguma proteção pro seu veículo?`
    const enviou = await enviarComoGente(c, texto, undefined, c.ultimo_inbound_em)
    await registrarEvento(c.telefone, 'retomada', { enviou })
    if (enviou) await liberar(c.telefone, null, true)
  }
}

/** Devolve true se respondeu o cliente. */
async function atender(c: ContatoIsa): Promise<boolean> {
  const visto = c.ultimo_inbound_em
  if (!c.conversation_id) {
    await liberar(c.telefone, visto, false)
    return false
  }

  const novas = await inboundsNovas(c.conversation_id, c.processado_ate)
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

  const enviar = (partes: string[]) => enviarComoGente(c, partes, ultimaInbound, visto)

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
    if (leituras.some((l) => !l || DOC_DE_FECHAMENTO.has(l.tipo))) {
      await transferir(c, 'documento', enviar)
      await liberar(c.telefone, visto, true)
      return true
    }
  }

  // Entrada pelo popup ("Quero meu desconto!"): R$ 50 na ativacao, uma vez, com o antes e o depois.
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

  // Toque num botao da mensagem dos 5 min: resposta montada pelo codigo (cobertura do plano ou
  // "qual a sua duvida?") + os R$ 50, que so aqui podem aparecer — o template nao fala de oferta.
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
      const d = await concederDesconto50(c, lead5?.id ?? null)
      if (d) partes.push(mensagemDesconto50(d, { perguntaSeFecha: botao === PAYLOAD_COBRE }))
      await registrarEvento(c.telefone, 'botao_5min', { botao, desconto: d })
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
  const desconto =
    c.desconto50_em && c.desconto50_de && c.desconto50_para
      ? { de: Number(c.desconto50_de), para: Number(c.desconto50_para) }
      : null
  const fatos = lead ? fatosDoLead(lead, desconto) : null

  const hist = await historico(c.conversation_id, 30, c.reiniciada_em)
  const ultimaNossa = [...hist].reverse().find((m) => m.direction === 'outbound')

  // PLACA E ACHADA PELO CODIGO, nunca pela IA (bug de 11/09/2026: "Pyv8i13" virou um HB20 inventado,
  // sem consulta, sem lead no Power e sem PDF). Placa nova na mensagem = consulta direto.
  const placaDita = placaNoTexto(novas.map((m) => m.content).join('\n'))
  const placaDoLead = (lead?.placa_interesse || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const textoNovas = novas.map((m) => m.content).join('\n')
  const cumprimentarAgora = precisaCumprimentar(ultimaNossa ? new Date(ultimaNossa.criada_em) : null, agora)
  if (placaDita && placaDita !== placaDoLead) {
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
    await liberar(c.telefone, visto, enviou)
    return enviou
  }

  // Respondeu a pergunta de leilao/aplicativo: cota a placa que estava esperando.
  if (c.placa_pendente) {
    const dito = lerLeilaoApp(textoNovas)
    if (dito.leilao !== null || dito.app !== null) {
      const enviou = await cotarPlacaPendente(c, c.placa_pendente, dito, { cumprimentar: cumprimentarAgora, nome: c.nome ?? lead?.nome ?? null, desconto, ultimaInbound, visto })
      await liberar(c.telefone, visto, enviou)
      return enviou
    }
  }
  const saida = await pensar({
    nome: c.nome ?? lead?.nome ?? null,
    genero: (c.genero as 'm' | 'f' | null) ?? null,
    fatos,
    jaGanhouDesconto: !!c.desconto50_em,
    falaDeAdesivo: falaDeAdesivo(c.telefone),
    historico: hist,
    agora,
    cumprimentar: precisaCumprimentar(ultimaNossa ? new Date(ultimaNossa.criada_em) : null, agora),
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

  const enviou = saida.resposta ? await enviarComoGente(c, saida.resposta, ultimaInbound, visto) : false

  // Escolheu o plano e a resposta nao pediu os documentos: o proximo passo vai pelo codigo
  // (teste de 11/09/2026 — "gostei do vip, como funciona guincho?" e a IA so explicou o guincho).
  if (enviou && !saida.gatilho && escolheuPlano(novas.map((m) => m.content).join('\n')) && !/\bcnh\b/i.test(saida.resposta)) {
    await enviarComoGente(c, [mensagemPedidoDocumentos()], ultimaInbound, visto)
    await registrarEvento(c.telefone, 'pediu_documentos', null)
  }

  // Respondeu a mensagem dos 5 min escrevendo, sem tocar no botao: os R$ 50 vem logo depois.
  if (enviou && !saida.gatilho && c.entrada === '5min' && !c.desconto50_em) {
    const d = await concederDesconto50(c, lead?.id ?? null)
    if (d) await enviarComoGente(c, [mensagemDesconto50(d, { perguntaSeFecha: false })], ultimaInbound, visto)
  }

  // Desconto: a Isa ja disse "vou confirmar com meu supervisor"; pausa e manda o alerta com botoes.
  if (saida.gatilho === 'desconto') await pedirDescontoAoDono(c)
  // Nao soube responder: respondeu "vou confirmar" e o dono fica sabendo (a Isa segue ligada).
  // Escolheu o plano mas nao tem comprovante de residencia: a Isa pede CNH + documento do veiculo
  // e o time e avisado (dono, 11/09/2026). Ela segue ligada.
  if (saida.gatilho === 'sem_comprovante') {
    await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'sem_comprovante', detalhe: ultimoTexto.slice(0, 200) })
  }
  if (saida.gatilho === 'sem_informacao') {
    await alertarDono({ telefone: c.telefone, nome: c.nome, motivo: 'sem_informacao', detalhe: ultimoTexto.slice(0, 200) })
  }

  await liberar(c.telefone, visto, enviou)
  return enviou
}

const GATILHOS_SILENCIOSOS = new Set(['hostil', 'associado', 'validador'])

const SITE = 'https://21go.site'

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
  await enviarComoGente(c, [ab ? `${ab}\n\nperai que vou consultar aqui 🙏🏼` : 'perai que vou consultar aqui 🙏🏼'], p.ultimaInbound, p.visto)

  const orc = await orcarPorPlaca({ telefone: c.telefone, nome: p.nome, placa: p.placa, leilao: p.leilao, carroApp: p.app })
  await registrarEvento(c.telefone, 'orcamento', { placa: p.placa, resultado: orc.tipo, tabela: orc.tipo === 'ok' ? orc.tabela : undefined })

  if (orc.tipo === 'ok') {
    await atualizarContato(c.telefone, { lead_id: orc.lead.id, preco_da_tabela: orc.tabela })
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
      [`${ab}não achei esse modelo aqui 🤔 me manda o nome completo, do jeito que tá no documento, ou a placa se já tiver?`],
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
  await enviarComoGente(c, ['perai que vou consultar aqui 🙏🏼'], p.ultimaInbound, p.visto)
  const orc = await orcarPorModelo({
    telefone: c.telefone, nome: c.nome, tipo: p.tipo, brandId: p.brandId, brandText: p.brandText,
    modelId: p.modelId, modelText: p.modelText, ano: p.ano, codFipe: p.codFipe, leilao: false, carroApp: false,
  })
  await registrarEvento(c.telefone, 'orcamento', { modelo: p.modelText, ano: p.ano, resultado: orc.tipo })
  if (orc.tipo === 'ok') {
    await atualizarContato(c.telefone, { lead_id: orc.lead.id, preco_da_tabela: orc.tabela })
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

function primeiroNomeDe(nome: string | null): string | null {
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
  texto: string | string[],
  ultimaInboundWamid: string | undefined,
  visto: string | null,
  sender = 'isa',
): Promise<boolean> {
  // Lista = partes ja montadas (a simulacao vai inteira numa mensagem); texto = divide na linha em branco.
  const partes = Array.isArray(texto) ? texto.filter(Boolean) : dividirEmPartes(texto)
  if (partes.length === 0) return false

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
    try {
      const wamid = await enviarTexto(c.telefone, partes[i])
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
        content: partes[i],
        sent_at: new Date().toISOString(),
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
      await dormir(pausaEntreSegundos(partes[i], proxima))
    }
  }
  return enviadas > 0
}
