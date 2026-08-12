/**
 * O preco do site do consultor. UM lugar so.
 *
 * Sem server-only de proposito: o formulario (client) e o preco do topo da
 * pagina (server) leem daqui, junto com quem cria a assinatura no Asaas. Antes
 * o numero estava escrito em tres arquivos — trocar em dois e esquecer o
 * terceiro faria a pagina anunciar um valor e a cobranca nascer com outro.
 *
 * Ja foi baixado pra R$ 5 uma vez (12/08/2026), que e o MINIMO que o Asaas
 * aceita — medido chamando /subscriptions com 0,50 / 1 / 2 / 3 / 4 (todos
 * recusados) e 5 (aceito). Fica registrado aqui caso precise de novo.
 *
 * ⚠️ Trocar este numero muda o que as assinaturas NOVAS cobram. As que ja
 * existem no Asaas seguem no valor com que nasceram — pra mudar uma delas e
 * preciso editar a assinatura la, nao adianta so mexer aqui.
 */
export const MENSALIDADE = 80

/** O minimo que o Asaas aceita, se um dia precisar baixar pra testar de novo. */
export const MENSALIDADE_MINIMA_ASAAS = 5
