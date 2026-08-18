/**
 * Telefone na tela do painel.
 *
 * O vendedor ve o numero MASCARADO. Ele trouxe o lead, mas quem atende e fecha
 * e o consultor — numero cheio na mao do divulgador e o caminho pra ele fechar
 * por fora e o consultor pagar comissao por uma venda que nao existiu no funil
 * dele. Admin ve inteiro.
 */

export function normalizarWhatsapp(bruto: string): string | null {
  const so = (bruto || '').replace(/\D/g, '')
  if (so.length < 10) return null
  const com55 = so.startsWith('55') ? so : `55${so}`
  if (com55.length < 12 || com55.length > 13) return null
  return com55
}

function partes(tel: string): { ddd: string; numero: string } | null {
  const so = (tel || '').replace(/\D/g, '')
  const sem55 = so.startsWith('55') ? so.slice(2) : so
  if (sem55.length < 10 || sem55.length > 11) return null
  return { ddd: sem55.slice(0, 2), numero: sem55.slice(2) }
}

export function mascararTelefone(tel: string): string {
  const p = partes(tel)
  if (!p) return '—'
  return `(${p.ddd}) ${'*'.repeat(p.numero.length - 4)}-${p.numero.slice(-4)}`
}

export function formatarTelefone(tel: string): string {
  const p = partes(tel)
  if (!p) return '—'
  const corte = p.numero.length - 4
  return `(${p.ddd}) ${p.numero.slice(0, corte)}-${p.numero.slice(corte)}`
}
