/**
 * O slug do divulgador dentro do site do consultor: `/andersonagripino/juliano`.
 *
 * Modulo puro de proposito — nao importa nada, nem o `@/lib/rotas-reservadas`.
 * A lista de rotas chega por parametro. E o que permite `node --test` rodar
 * isto direto, sem bundler, e e a unica parte do painel que da pra provar sem
 * subir servidor.
 */

const TAMANHO_MAXIMO = 40
const TAMANHO_MINIMO = 3

export function normalizarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, TAMANHO_MAXIMO)
}

/**
 * Devolve `null` quando o nome nao gera slug valido (ex.: "Jo"). Quem chama
 * transforma isso em "digite seu nome completo" — melhor que emitir um link
 * que a pessoa vai espalhar e depois nao resolver.
 */
export function slugDeVendedor(a: {
  nome: string
  whatsapp: string
  existentes: Set<string>
  reservadas: Set<string>
}): string | null {
  const base = normalizarSlug(a.nome)
  if (base.length < TAMANHO_MINIMO) return null

  const ocupado = (s: string) => a.existentes.has(s) || a.reservadas.has(s)

  if (!ocupado(base)) return base

  /**
   * Desempate pelos 4 ultimos digitos do celular, e nao por "2", "3": o link e
   * ditado no WhatsApp e escrito em post de Instagram. "juliano8062" a pessoa
   * reconhece como dela; "juliano2" ninguem lembra de quem e.
   */
  const finalCelular = a.whatsapp.replace(/\D/g, '').slice(-4)
  const comFinal = `${base.slice(0, TAMANHO_MAXIMO - finalCelular.length)}${finalCelular}`
  if (!ocupado(comFinal)) return comFinal

  for (let n = 2; n < 100; n++) {
    const sufixo = `${finalCelular}${n}`
    const tentativa = `${base.slice(0, TAMANHO_MAXIMO - sufixo.length)}${sufixo}`
    if (!ocupado(tentativa)) return tentativa
  }
  return null
}
