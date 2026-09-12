/**
 * Leitura do que o cliente manda que nao e texto: foto, print, documento, PDF (dono, 11/09/2026:
 * "vai ler doc, imagem, foto, print, ler pdf tbm"). Audio continua em transcrever.ts.
 *
 * O que foi lido vira TEXTO na conversa ("📎 cotação/orçamento: ..."), como a transcricao do
 * audio — a IA responde lendo isso, e o painel mostra o mesmo texto. CNH, CRLV e comprovante sao
 * cliente FECHANDO: continuam transferindo pro 4824 e pausando (regra do dono de 10/09/2026).
 * Logica pura.
 */

export type TipoMidia =
  | 'cnh'
  | 'crlv'
  | 'comprovante_residencia'
  | 'cotacao'
  | 'foto_veiculo'
  | 'boleto'
  | 'print_conversa'
  | 'outro'

export const ROTULO_MIDIA: Record<TipoMidia, string> = {
  cnh: 'CNH',
  crlv: 'documento do veículo',
  comprovante_residencia: 'comprovante de residência',
  cotacao: 'cotação/orçamento',
  foto_veiculo: 'foto do veículo',
  boleto: 'boleto',
  print_conversa: 'print',
  outro: 'arquivo',
}

/**
 * Documentos de contratacao. Dono (12/09/2026): documento no COMECO e pra cotar — a Isa le (a placa
 * do CRLV vira simulacao) e NAO transfere; so transfere quando ele esta FECHANDO (escolheu plano).
 * E ao fechar, pede so o que ainda falta.
 */
export const DOC_DE_FECHAMENTO = new Set<TipoMidia>(['cnh', 'crlv', 'comprovante_residencia'])
export const DOCS_CONTRATACAO: readonly TipoMidia[] = ['cnh', 'crlv', 'comprovante_residencia']
const PEDIDO_DOC: Record<'cnh' | 'crlv' | 'comprovante_residencia', string> = {
  cnh: 'a foto da CNH',
  crlv: 'o documento do veículo',
  comprovante_residencia: 'um comprovante de residência',
}

/** Que documento esta neste texto lido ("📎 CNH: ..."), se for de contratacao. */
export function tipoDoTextoLido(texto: string | null | undefined): TipoMidia | null {
  const t = texto || ''
  for (const tipo of DOCS_CONTRATACAO) if (t.includes(`📎 ${ROTULO_MIDIA[tipo]}`)) return tipo
  return null
}

/** O que ainda falta pra fechar, no jeito de pedir ("a foto da CNH", ...). Vazio = tem tudo. */
export function docsQueFaltam(recebidos: Iterable<TipoMidia>): string[] {
  const tem = new Set(recebidos)
  return DOCS_CONTRATACAO.filter((d) => !tem.has(d)).map((d) => PEDIDO_DOC[d as keyof typeof PEDIDO_DOC])
}

/** Nome curto pro prompt ("CNH", "documento do veículo"). */
export function nomeDoDoc(tipo: TipoMidia): string {
  return ROTULO_MIDIA[tipo]
}

export interface Leitura {
  tipo: TipoMidia
  resumo: string
  placa: string | null
}

export type FormatoLegivel = 'imagem' | 'pdf'

/** O que o modelo consegue ler. Video, figurinha e .docx ficam de fora. */
export function formatoLegivel(mime: string | null | undefined): FormatoLegivel | null {
  const m = (mime || '').toLowerCase().split(';')[0].trim()
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return 'imagem'
  if (m === 'application/pdf') return 'pdf'
  return null
}

export const TAMANHO_MAXIMO = 10 * 1024 * 1024

/** Le a resposta do modelo; qualquer coisa torta vira "outro", nunca derruba a fila. */
export function lerSaidaMidia(bruto: string): Leitura | null {
  try {
    const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const j = JSON.parse(limpo) as { tipo?: unknown; resumo?: unknown; placa?: unknown }
    const tipo = typeof j.tipo === 'string' && j.tipo in ROTULO_MIDIA ? (j.tipo as TipoMidia) : 'outro'
    const resumo = typeof j.resumo === 'string' ? j.resumo.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
    const p = typeof j.placa === 'string' ? j.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
    return { tipo, resumo, placa: /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null }
  } catch {
    return null
  }
}

/** O texto que fica na conversa no lugar do "[imagem]" — legenda do cliente, se tinha, vem junto. */
export function textoDaLeitura(legenda: string | null | undefined, l: Leitura): string {
  const leg = (legenda || '').trim()
  const semLegenda = !leg || /^\[(imagem|documento|image|document)\]$/i.test(leg)
  const lido = `📎 ${ROTULO_MIDIA[l.tipo]}${l.resumo ? `: ${l.resumo}` : ''}${l.placa && !l.resumo.includes(l.placa) ? ` (placa ${l.placa})` : ''}`
  return semLegenda ? lido : `${leg}\n${lido}`
}
