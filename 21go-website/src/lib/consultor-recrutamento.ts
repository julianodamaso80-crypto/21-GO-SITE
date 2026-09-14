import 'server-only'
import { sql } from '@/lib/isa/banco'
import { sendText, formatPhone } from '@/lib/whatsapp'
import { cumprimento } from '@/lib/isa/hora.regras'
import {
  decidir,
  mensagemBoasVindas,
  mensagemAtendimentoVirtual,
  podeResponder,
  type AcaoRecrutamento,
} from '@/lib/consultor-recrutamento.regras'

/**
 * O atendimento de quem chega pelo "Quero Ser Consultor" (sites .site).
 *
 * Chamado pelo webhook da Evolution a cada mensagem RECEBIDA no 4824. Toda a decisao mora em
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

  await sendText(telefone, texto)
  await marcar({
    telefone,
    nome: p.nome ?? null,
    coluna: acao === 'boas_vindas' ? 'boas_vindas_em' : 'aviso_virtual_em',
  })
  console.log(`[consultor] ${acao} -> ${telefone.slice(0, 6)}***`)
  return acao
}
