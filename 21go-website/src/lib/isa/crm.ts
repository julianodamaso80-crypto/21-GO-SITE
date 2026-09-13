import 'server-only'

/**
 * Aviso pro CRM (crm21go.site) de que uma mensagem da Isa entrou ou saiu — o CRM emite o socket
 * `inbox:new_message` e a conversa sobe na lista do /whatsapp na hora, no site e no app, igual
 * as do WhatsApp da Evolution (dono, 13/09/2026: "toda conversa que ela atender tem que cair no
 * CRM, tanto Apple como web, por ordem de chegada").
 *
 * Melhor esforco: nunca segura a resposta ao cliente. Sem ATENDIMENTO_CRM_URL, nao faz nada.
 */
export function avisarCrm(p: { conversationId: string; messageId: string }): void {
  const base = (process.env.ATENDIMENTO_CRM_URL || '').replace(/\/+$/, '')
  const chave = process.env.ATENDIMENTO_CRM_CHAVE
  if (!base || !chave) return
  fetch(`${base}/api/atendimento-isa/eventos/mensagem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atendimento-chave': chave },
    body: JSON.stringify(p),
    signal: AbortSignal.timeout(5_000),
  })
    .then((r) => {
      if (!r.ok) console.warn('[isa] aviso pro CRM recusado:', r.status)
    })
    .catch((err) => console.warn('[isa] aviso pro CRM falhou:', err instanceof Error ? err.message : err))
}
