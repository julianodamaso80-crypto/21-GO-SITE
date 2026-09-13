/**
 * O 9 do celular brasileiro — logica pura.
 *
 * O WhatsApp devolve o `from` de alguns celulares SEM o nono digito (558896490972) enquanto o lead
 * do site tem o numero com ele (5588996490972). Em 13/09/2026, no primeiro dia em producao, isso
 * partiu a conversa em duas: um contato recebeu a mensagem dos 5 min, OUTRO respondeu — e a Isa
 * atendeu o segundo sem saber da simulacao. A forma canonica aqui e sempre COM o 9 (a mesma que o
 * formulario grava); a Cloud API aceita enviar pra qualquer uma das duas.
 */

/** 55 + DDD + 9 + 8 digitos. Fixo (12 digitos com 2-5 depois do DDD) fica como esta. */
export function telefoneCanonico(numero: string | null | undefined): string {
  const d = (numero || '').replace(/\D/g, '')
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return `${d.slice(0, 4)}9${d.slice(4)}`
  return d
}

/** As duas grafias do mesmo celular (com e sem o 9), pra casar lead e conversa antigos. */
export function variantesDoTelefone(numero: string | null | undefined): string[] {
  const canon = telefoneCanonico(numero)
  if (!canon) return []
  const m = canon.match(/^(55\d{2})9([6-9]\d{7})$/)
  return m ? [canon, `${m[1]}${m[2]}`] : [canon]
}
