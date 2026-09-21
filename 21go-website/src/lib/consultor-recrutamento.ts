import 'server-only'
import { sql } from '@/lib/isa/banco'
import { sendText, formatPhone } from '@/lib/whatsapp'
import { cumprimento } from '@/lib/isa/hora.regras'
import {
  decidir,
  ehDoRecrutamento,
  mensagemBoasVindas,
  mensagemAtendimentoVirtual,
  podeResponder,
  type AcaoRecrutamento,
} from '@/lib/consultor-recrutamento.regras'

/**
 * O atendimento de quem chega pelo "Quero Ser Consultor" (sites .site).
 *
 * Desde 21/09/2026 o formulario abre o numero da Isa (98004-0964) e quem responde e o worker
 * dela, por `recrutamentoNaIsa`. O caminho antigo (webhook da Evolution, 4824) continua para quem
 * ainda escrever no 4824. Toda a decisao mora em
 * `consultor-recrutamento.regras.ts`; aqui so ficam o estado (uma linha por telefone) e o
 * envio pela mesma instancia que recebeu a mensagem.
 *
 * Nunca inicia conversa: o gatilho e sempre uma mensagem do lead.
 */

interface Estado {
  boas_vindas_em: Date | null
  aviso_virtual_em: Date | null
}

async function estadoDe(telefone: string): Promise<Estado | null> {
  const linhas = await sql<Estado>(
    'select boas_vindas_em, aviso_virtual_em from consultor_recrutamento where telefone = $1',
    [telefone],
  )
  return linhas[0] ?? null
}

async function marcar(p: { telefone: string; nome: string | null; coluna: 'boas_vindas_em' | 'aviso_virtual_em' }): Promise<void> {
  // Boas-vindas novas zeram o aviso: formulario reenviado e cadastro novo, e o lead volta a
  // ter direito a uma resposta se perguntar algo.
  const extra = p.coluna === 'boas_vindas_em' ? ', aviso_virtual_em = null' : ''
  await sql(
    `insert into consultor_recrutamento (telefone, nome, ${p.coluna})
       values ($1, $2, now())
     on conflict (telefone) do update
       set ${p.coluna} = now(),
           nome = coalesce(consultor_recrutamento.nome, excluded.nome)${extra}`,
    [p.telefone, p.nome],
  )
}

export async function atenderRecrutamento(p: {
  telefone: string
  texto: string | null
  nome?: string | null
}): Promise<AcaoRecrutamento> {
  const telefone = formatPhone(p.telefone)
  const estado = await estadoDe(telefone)
  return responder({
    telefone,
    nome: p.nome ?? null,
    texto: p.texto,
    estado,
    enviar: async (texto) => {
      await sendText(telefone, texto)
      return true
    },
  })
}

/**
 * O mesmo atendimento no numero da Isa (98004-0964), chamado pelo worker dela antes de qualquer
 * fluxo de venda. `null` = nao e do recrutamento, a Isa segue. Qualquer outro retorno = e do
 * recrutamento e a Isa NAO fala nada de venda, mesmo quando a resposta aqui e 'nada' (trava
 * fechada ou o robo ja calou).
 */
export async function recrutamentoNaIsa(p: {
  telefone: string
  nome: string | null
  novas: readonly (string | null)[]
  historico: readonly (string | null)[]
  enviar: (texto: string) => Promise<boolean>
}): Promise<AcaoRecrutamento | null> {
  const estado = await estadoDe(p.telefone)
  if (!ehDoRecrutamento({ textos: [...p.novas, ...p.historico], boasVindasEm: estado?.boas_vindas_em ?? null })) {
    return null
  }
  return responder({
    telefone: p.telefone,
    nome: p.nome,
    texto: p.novas.filter(Boolean).join('\n'),
    estado,
    enviar: p.enviar,
  })
}

async function responder(p: {
  telefone: string
  nome: string | null
  texto: string | null
  estado: Estado | null
  enviar: (texto: string) => Promise<boolean>
}): Promise<AcaoRecrutamento> {
  const { telefone, estado } = p
  const acao = decidir({
    texto: p.texto,
    boasVindasEm: estado?.boas_vindas_em ?? null,
    avisoVirtualEm: estado?.aviso_virtual_em ?? null,
    agora: new Date(),
  })
  if (acao === 'nada') return 'nada'

  // A trava fica DEPOIS da decisao de proposito: fora da allowlist nada e enviado e nada e
  // gravado, entao ligar a env mais tarde atende quem escrever a partir dali, do zero.
  if (!podeResponder(telefone, {
    ativo: process.env.CONSULTOR_BOT_ATIVO,
    allowlist: process.env.CONSULTOR_BOT_ALLOWLIST,
  })) {
    console.log(`[consultor] ${acao} nao enviado (fora da allowlist): ${telefone.slice(0, 6)}***`)
    return 'nada'
  }

  const texto =
    acao === 'boas_vindas' ? mensagemBoasVindas(cumprimento(new Date())) : mensagemAtendimentoVirtual()

  if (!(await p.enviar(texto))) return 'nada'
  await marcar({
    telefone,
    nome: p.nome,
    coluna: acao === 'boas_vindas' ? 'boas_vindas_em' : 'aviso_virtual_em',
  })
  console.log(`[consultor] ${acao} -> ${telefone.slice(0, 6)}***`)
  return acao
}
