import 'server-only'
import { enviarTemplate, enviarTexto, numeroDeAlerta } from '@/lib/isa/cloud'
import { registrarEvento, sql } from '@/lib/isa/banco'
import { payloadDesconto } from '@/lib/isa/dono.regras'

/**
 * Avisos da Isa pro dono (21 96577-4240). Ordem do dono: "sempre utilidade".
 *
 * 1o o template UTILITY (unico jeito de falar com ele fora da janela de 24h). Se a Meta recusar
 * (template ainda em analise, por exemplo), cai pra texto comum — que so passa se o dono escreveu
 * pro 98004-0964 nas ultimas 24h. Se nada sair, fica o evento "alerta_falhou": alerta nunca some
 * em silencio (foi o que aconteceu com o canal de entrega dos sites, 21/08/2026).
 */

const PAINEL = 'https://21go.site/painel'

const MOTIVO_LEGIVEL: Record<string, string> = {
  documento: 'cliente mandou documento (transferido pro 4824)',
  associado: 'associado pedindo suporte (transferido pro 4824)',
  sem_preco: 'sem preco pra esse veiculo (transferido pro 4824)',
  robo: 'cliente perguntou se e robo',
  hostil: 'cliente xingou ou ameacou',
  validador: 'a Isa ia passar um numero que nao confere — segurei a mensagem',
  sem_informacao: 'cliente perguntou algo que a Isa nao soube responder',
  sem_comprovante: 'cliente escolheu o plano e nao tem comprovante de residencia',
  desconto: 'pedido de desconto',
  qualidade: 'qualidade do numero caiu na Meta',
  template: 'template da mensagem dos 5 min deixou de ser utilidade aprovada',
}

export async function alertarDono(p: { telefone: string; nome: string | null; motivo: string; detalhe: string }): Promise<void> {
  const para = numeroDeAlerta()
  if (!para) return
  const motivo = MOTIVO_LEGIVEL[p.motivo] ?? p.motivo
  const detalhe = `${p.detalhe} — abrir: ${PAINEL}?c=${p.telefone}`
  try {
    await enviarTemplate(para, 'alerta_atendimento_isa', [motivo, p.nome || 'sem nome', p.telefone, detalhe])
    await registrarEvento(p.telefone, 'alerta', { motivo: p.motivo, via: 'template' }, 'sistema')
    return
  } catch (err) {
    const erroTemplate = err instanceof Error ? err.message : String(err)
    try {
      await enviarTexto(para, `⚠️ Atendimento pausado - 21Go\n\nMotivo: ${motivo}\nCliente: ${p.nome || 'sem nome'}\nTelefone: ${p.telefone}\nDetalhe: ${detalhe}`)
      await registrarEvento(p.telefone, 'alerta', { motivo: p.motivo, via: 'texto', erroTemplate }, 'sistema')
    } catch (err2) {
      await registrarEvento(p.telefone, 'alerta_falhou', {
        motivo: p.motivo,
        erroTemplate,
        erroTexto: err2 instanceof Error ? err2.message : String(err2),
      }, 'sistema')
    }
  }
}

/**
 * Pedido de desconto: alerta com botoes Autorizar / Recusar. O telefone do cliente vai no payload
 * de cada botao; e ainda fica marcado no contato do dono como o ultimo pedido aberto — se ele
 * responder o valor em texto, sem tocar no botao, e desse cliente.
 */
export async function alertarDesconto(p: {
  telefone: string
  nome: string | null
  veiculo: string
  plano: string
}): Promise<void> {
  const para = numeroDeAlerta()
  if (!para) return
  await sql(
    `INSERT INTO public.isa_contatos (telefone, aguardando_dono) VALUES ($1, $2)
     ON CONFLICT (telefone) DO UPDATE SET aguardando_dono = EXCLUDED.aguardando_dono, updated_at = now()`,
    [para, `desconto:${p.telefone}`],
  )
  try {
    await enviarTemplate(para, 'alerta_desconto_isa', [p.nome || 'sem nome', p.telefone, p.veiculo || '-', p.plano || '-'], [
      payloadDesconto(p.telefone, 'sim'),
      payloadDesconto(p.telefone, 'nao'),
    ])
    await registrarEvento(p.telefone, 'alerta', { motivo: 'desconto', via: 'template' }, 'sistema')
  } catch (err) {
    const erroTemplate = err instanceof Error ? err.message : String(err)
    try {
      await enviarTexto(
        para,
        `💸 Pedido de desconto - 21Go\n\nCliente: ${p.nome || 'sem nome'}\nTelefone: ${p.telefone}\nVeículo: ${p.veiculo}\nPlano: ${p.plano}\n\nResponda com o VALOR da ativação que autoriza (ex: 479) ou NAO.\n${PAINEL}?c=${p.telefone}`,
      )
      await registrarEvento(p.telefone, 'alerta', { motivo: 'desconto', via: 'texto', erroTemplate }, 'sistema')
    } catch (err2) {
      await registrarEvento(p.telefone, 'alerta_falhou', {
        motivo: 'desconto',
        erroTemplate,
        erroTexto: err2 instanceof Error ? err2.message : String(err2),
      }, 'sistema')
    }
  }
}
