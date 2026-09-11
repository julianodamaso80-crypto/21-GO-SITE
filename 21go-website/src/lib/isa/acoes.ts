import 'server-only'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { atualizarContato, registrarEvento, sql, type ContatoIsa, type MensagemHistorico } from '@/lib/isa/banco'
import { enviarTexto } from '@/lib/isa/cloud'
import { alertarDono, alertarDesconto } from '@/lib/isa/alertas'
import { leadDoCliente, fatosDoLead } from '@/lib/isa/fatos'
import { mensagensDoNumero } from '@/lib/whatsapp-cloud'
import { planoDoCliente } from '@/lib/isa/abordagem.regras'
import {
  interpretarDono,
  valorAutorizadoValido,
  mensagemDescontoDoDono,
  mensagemDonoRecusou,
  mensagemTransferencia,
} from '@/lib/isa/dono.regras'

/**
 * O que a Isa FAZ quando nao e so responder: transferir, pausar e avisar, dar o desconto de
 * entrada e atender a resposta do dono. Regras do dono em 10/09/2026:
 *   - documento e associado: transfere pro 4824 e pausa na hora; avisa o dono
 *   - robo, xingamento, numero que nao confere: pausa (silencia) e avisa o dono
 *   - desconto pedido: "vou confirmar com meu supervisor", pausa e manda o alerta com botoes
 *   - R$ 50 na ativacao: automatico so nas entradas popup e 5 min, uma vez por telefone
 */

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function pausar(telefone: string, motivo: string, detalhe: Record<string, unknown> = {}): Promise<void> {
  await atualizarContato(telefone, { ligada: false, pausa_motivo: motivo, pausa_por: 'isa', pausada_em: new Date().toISOString() })
  await registrarEvento(telefone, 'pausou', { motivo, ...detalhe })
}

/** Resumo que vai pro time (no link do 4824 e no alerta). So dados da simulacao — nunca inventado. */
export async function resumoDoCliente(c: ContatoIsa): Promise<{ texto: string; veiculo: string; plano: string }> {
  const lead = await leadDoCliente(c.telefone, c.lead_id, c.reiniciada_em).catch(() => null)
  if (!lead) return { texto: `Nome: ${c.nome || '-'}`, veiculo: '-', plano: '-' }
  const f = fatosDoLead(lead, null)
  const veiculo = `${f.veiculo.descricao}${f.veiculo.ano ? ` ${f.veiculo.ano}` : ''}`
  const ref = f.planos.find((p) => p.ativacao === f.ativacaoReferencia) ?? f.planos[0]
  const plano = ref ? `${ref.nome} ${brl(ref.mensal)}/mês + ativação ${brl(f.ativacaoReferencia ?? ref.ativacao ?? 0)}` : '-'
  return { texto: `Nome: ${lead.nome || c.nome || '-'} | Veículo: ${veiculo} | Plano: ${plano}`, veiculo, plano }
}

async function gravarSaida(c: ContatoIsa, wamid: string, texto: string, sender = 'isa'): Promise<void> {
  await upsertMessage({
    conversation_id: c.conversation_id,
    whatsapp_message_id: wamid,
    evolution_instance: 'cloud_isa',
    jid: phoneToJid(c.telefone) ?? `${c.telefone}@s.whatsapp.net`,
    direction: 'outbound',
    status: 'SENT',
    sender,
    message_type: 'text',
    content: texto,
    sent_at: new Date().toISOString(),
  }).catch((err) => console.error('[isa] enviada mas nao gravada:', err))
}

/** Documento, associado, sem preco: manda o link do 4824 com o resumo, pausa e avisa o dono. */
export async function transferir(
  c: ContatoIsa,
  motivo: 'documento' | 'associado' | 'sem_preco' | 'manual',
  enviar: (partes: string[]) => Promise<boolean>,
  opcoes: { avisarDono?: boolean; por?: string } = {},
): Promise<void> {
  const r = await resumoDoCliente(c)
  await enviar([mensagemTransferencia({ motivo, resumo: `${r.texto} | Motivo: ${motivo}` })])
  await atualizarContato(c.telefone, {
    ligada: false,
    pausa_motivo: motivo,
    pausa_por: opcoes.por ?? 'isa',
    pausada_em: new Date().toISOString(),
    transferido_em: new Date().toISOString(),
  })
  await registrarEvento(c.telefone, 'transferiu', { motivo, para: '4824' }, opcoes.por ?? 'isa')
  // Transferencia feita pelo proprio dono no painel nao precisa avisar ele mesmo.
  if (opcoes.avisarDono !== false) await alertarDono({ telefone: c.telefone, nome: c.nome, motivo, detalhe: r.texto })
}

/** Robo, xingamento, validador: a Isa fica calada e o dono e avisado. */
export async function pausarEAvisar(c: ContatoIsa, motivo: string, detalhe: string): Promise<void> {
  await pausar(c.telefone, motivo)
  await alertarDono({ telefone: c.telefone, nome: c.nome, motivo, detalhe })
}

/** Pedido de desconto: a resposta "vou confirmar com meu supervisor" ja saiu; pausa e alerta. */
export async function pedirDescontoAoDono(c: ContatoIsa): Promise<void> {
  const r = await resumoDoCliente(c)
  await pausar(c.telefone, 'desconto')
  await atualizarContato(c.telefone, { aguardando_dono: 'desconto' })
  await alertarDesconto({ telefone: c.telefone, nome: c.nome, veiculo: r.veiculo, plano: r.plano })
}

/**
 * R$ 50 na ativacao — so nas entradas popup e 5 min, uma vez por telefone. Grava de/para (a Isa
 * passa a falar o valor com desconto) e devolve os valores pra frase "em vez de pagar X, vai pagar Y".
 *
 * O "de" e a ativacao do plano que o cliente tinha na tela (Premium/Especiais pagam mais que o
 * VIP): o do popup vem na propria mensagem; nos 5 min, o que o lead gravou.
 */
export async function concederDesconto50(
  c: ContatoIsa,
  leadId: string | null,
  planoNaTela: string | null = null,
): Promise<{ de: number; para: number } | null> {
  if (c.desconto50_em) return null
  const lead = await leadDoCliente(c.telefone, leadId ?? c.lead_id, c.reiniciada_em).catch(() => null)
  if (!lead) return null
  // A ativacao que o cliente VIU no site: lista inteira, nao so os planos que a Isa oferece.
  const fatos = fatosDoLead(lead, null, { todosOsPlanos: true })
  const plano = planoDoCliente(fatos.planos, planoNaTela ?? lead.cotacao_plano ?? null)
  const de = plano?.ativacao ?? fatos.ativacaoReferencia
  if (!de || de <= 50) return null
  const d = { de, para: Math.round((de - 50) * 100) / 100 }
  await atualizarContato(c.telefone, {
    lead_id: lead.id,
    desconto50_em: new Date().toISOString(),
    desconto50_de: d.de,
    desconto50_para: d.para,
  })
  await registrarEvento(c.telefone, 'desconto', { tipo: 'entrada', de: d.de, para: d.para, plano: plano?.nome ?? null })
  return d
}

/**
 * Resposta do dono (4240) a um alerta de desconto. Botao traz o telefone do cliente; texto solto
 * vale pro ultimo pedido aberto (guardado no contato do dono).
 */
export async function atenderDono(dono: ContatoIsa, novas: MensagemHistorico[]): Promise<void> {
  const phoneId = process.env.WA_PHONE_ID ?? ''
  for (const m of novas) {
    const bruto = mensagensDoNumero(m.raw_payload, phoneId).find((x) => x.id === m.whatsapp_message_id)
    const r = interpretarDono({ texto: m.content, payload: bruto?.payload ?? null })
    const pendente = (dono.aguardando_dono || '').match(/^(desconto|valor):(\d+)$/)
    const telCliente = 'telefone' in r && r.telefone ? r.telefone : pendente?.[2]
    if (!telCliente || r.acao === 'nada') continue

    const [cliente] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telCliente])
    if (!cliente) continue
    const lead = await leadDoCliente(cliente.telefone, cliente.lead_id, cliente.reiniciada_em).catch(() => null)
    const ativacao = cliente.desconto50_para ? Number(cliente.desconto50_para) : lead ? fatosDoLead(lead, null).ativacaoReferencia : null

    if (r.acao === 'autorizar') {
      await sql(`UPDATE public.isa_contatos SET aguardando_dono = $2 WHERE telefone = $1`, [dono.telefone, `valor:${telCliente}`])
      const pergunta = `de quanto fica a ativação do ${cliente.nome || telCliente}?${ativacao ? ` (hoje ${brl(ativacao)})` : ''} é só me mandar o valor`
      await enviarTexto(dono.telefone, pergunta).then((w) => gravarSaida(dono, w, pergunta)).catch(() => {})
      continue
    }

    if (r.acao === 'valor') {
      if (!ativacao || !valorAutorizadoValido(r.valor, ativacao)) {
        const aviso = `esse valor não dá: tem que ser menor que ${ativacao ? brl(ativacao) : 'a ativação atual'} 🙏🏼`
        await enviarTexto(dono.telefone, aviso).then((w) => gravarSaida(dono, w, aviso)).catch(() => {})
        continue
      }
      const texto = mensagemDescontoDoDono({ de: ativacao, para: r.valor })
      const ok = await falarComCliente(cliente, texto)
      if (ok) {
        await atualizarContato(cliente.telefone, {
          desconto50_em: new Date().toISOString(),
          desconto50_de: ativacao,
          desconto50_para: r.valor,
          aguardando_dono: null,
          ligada: true,
          pausa_motivo: null,
        })
        await registrarEvento(cliente.telefone, 'desconto', { tipo: 'dono', de: ativacao, para: r.valor }, 'juliano')
      }
      await sql(`UPDATE public.isa_contatos SET aguardando_dono = NULL WHERE telefone = $1`, [dono.telefone])
      const conf = ok
        ? `pronto, mandei pro ${cliente.nome || telCliente}: de ${brl(ativacao)} por ${brl(r.valor)} ✅`
        : `não consegui mandar pro ${cliente.nome || telCliente}: a janela de 24h dele fechou — só dá pra falar com ele pelo painel`
      await enviarTexto(dono.telefone, conf).then((w) => gravarSaida(dono, w, conf)).catch(() => {})
      continue
    }

    if (r.acao === 'recusar') {
      const ok = ativacao ? await falarComCliente(cliente, mensagemDonoRecusou(ativacao)) : false
      await atualizarContato(cliente.telefone, { aguardando_dono: null, ligada: true, pausa_motivo: null })
      await registrarEvento(cliente.telefone, 'desconto', { tipo: 'recusado' }, 'juliano')
      await sql(`UPDATE public.isa_contatos SET aguardando_dono = NULL WHERE telefone = $1`, [dono.telefone])
      const conf = ok ? `ok, avisei o ${cliente.nome || telCliente} que não rolou desconto a mais` : 'ok, sem desconto'
      await enviarTexto(dono.telefone, conf).then((w) => gravarSaida(dono, w, conf)).catch(() => {})
    }
  }
}

/** Mensagem ao cliente fora do fluxo normal (resposta do dono). So dentro da janela de 24h. */
async function falarComCliente(cliente: ContatoIsa, texto: string): Promise<boolean> {
  if (!cliente.janela_ate || new Date(cliente.janela_ate).getTime() < Date.now()) return false
  try {
    for (const parte of texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
      const w = await enviarTexto(cliente.telefone, parte)
      await gravarSaida(cliente, w, parte)
    }
    return true
  } catch (err) {
    await registrarEvento(cliente.telefone, 'envio_falhou', { erro: err instanceof Error ? err.message : String(err) })
    return false
  }
}
