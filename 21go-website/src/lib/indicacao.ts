import 'server-only'
import { supabaseAdmin } from './supabase-admin'

/**
 * Member Get Member rastreavel.
 *
 * O problema que isto resolve: o /indique so abria uma conversa no WhatsApp
 * pedindo "quero meu link". O link saia na mao, quando saia, e nada ligava o
 * amigo que fechou a quem trouxe ele — o desconto de 10% dependia de alguem
 * lembrar de quem indicou quem.
 *
 * Agora quem indica ganha um codigo curto na hora, e ele viaja na URL:
 *
 *   21go.com.br/andersonagripino?ind=k3m9x2
 *
 * ⚠️ O link carrega DUAS informacoes ao mesmo tempo e as duas tem dono
 * diferente: o `/andersonagripino` decide em qual Power o lead nasce, e o
 * `?ind=` decide quem ganha o desconto. Sao independentes de proposito — a
 * Maria pode indicar pelo site do consultor dela sem que a indicacao dela
 * roube o lead do consultor.
 */

export interface Indicador {
  codigo: string
  nome: string
  whatsapp: string
  consultorSlug: string | null
  /**
   * `true` so na primeira vez. E o que separa "entrou gente nova no Indique e
   * Ganhe" de "a mesma pessoa abriu a pagina de novo" — sem isso, o dono do
   * site levaria um aviso a cada vez que alguem reabrisse o proprio link.
   */
  novo: boolean
}

/**
 * Alfabeto sem `0/O` e sem `1/I/l`: o codigo vai ser ditado no WhatsApp e lido
 * em print de celular. Confundir zero com O e o jeito mais barato de fazer uma
 * indicacao legitima nao ser contada.
 */
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz'

function sortearCodigo(tamanho = 6): string {
  let s = ''
  for (let i = 0; i < tamanho; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
  }
  return s
}

/**
 * O codigo da pessoa. Mesma pessoa, mesmo codigo, sempre.
 *
 * A chave e o WhatsApp: se pedir o link de novo tem que voltar o MESMO codigo,
 * senao ela espalha dois links por ai e as indicacoes ficam divididas entre os
 * dois — cada um contando metade do desconto que ela ganhou.
 */
export async function garantirIndicador(dados: {
  nome: string
  whatsapp: string
  consultorSlug?: string | null
}): Promise<Indicador> {
  const supa = supabaseAdmin()

  const { data: existente } = await supa
    .from('indicadores')
    .select('codigo, nome, whatsapp, consultor_slug')
    .eq('whatsapp', dados.whatsapp)
    .maybeSingle()

  if (existente) {
    return {
      codigo: existente.codigo as string,
      nome: existente.nome as string,
      whatsapp: existente.whatsapp as string,
      consultorSlug: (existente.consultor_slug as string) ?? null,
      novo: false,
    }
  }

  // Colisao de codigo e improvavel (31^6 ≈ 887 milhoes), mas nao impossivel —
  // e um codigo repetido daria o desconto pra pessoa errada. Tenta de novo.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = sortearCodigo()
    const { error } = await supa.from('indicadores').insert({
      codigo,
      nome: dados.nome,
      whatsapp: dados.whatsapp,
      consultor_slug: dados.consultorSlug ?? null,
    })

    if (!error) {
      return {
        codigo,
        nome: dados.nome,
        whatsapp: dados.whatsapp,
        consultorSlug: dados.consultorSlug ?? null,
        novo: true,
      }
    }
    // 23505 no WHATSAPP significa que ela se cadastrou entre a leitura e o
    // insert (dois cliques rapidos). Busca de novo em vez de criar duplicata.
    if (error.code === '23505') {
      const { data } = await supa
        .from('indicadores')
        .select('codigo, nome, whatsapp, consultor_slug')
        .eq('whatsapp', dados.whatsapp)
        .maybeSingle()
      if (data) {
        return {
          codigo: data.codigo as string,
          nome: data.nome as string,
          whatsapp: data.whatsapp as string,
          consultorSlug: (data.consultor_slug as string) ?? null,
          novo: false,
        }
      }
      // Chegou aqui: o conflito foi no CODIGO, nao no whatsapp. Sorteia outro.
      continue
    }
    throw new Error(error.message)
  }

  throw new Error('não consegui gerar um código de indicação')
}

/** Quem e o dono deste codigo — usado pra registrar o uso e pra conferencia. */
export async function acharIndicador(codigo: string): Promise<Indicador | null> {
  const { data } = await supabaseAdmin()
    .from('indicadores')
    .select('codigo, nome, whatsapp, consultor_slug')
    .eq('codigo', codigo.trim().toLowerCase())
    .maybeSingle()

  if (!data) return null
  return {
    codigo: data.codigo as string,
    nome: data.nome as string,
    whatsapp: data.whatsapp as string,
    consultorSlug: (data.consultor_slug as string) ?? null,
    novo: false,
  }
}

/** Carimba que o link foi usado. Falha aqui nao pode derrubar a gravacao do lead. */
export async function marcarUso(codigo: string): Promise<void> {
  await supabaseAdmin()
    .from('indicadores')
    .update({ ultimo_uso: new Date().toISOString() })
    .eq('codigo', codigo)
    .then(
      () => {},
      () => {},
    )
}
