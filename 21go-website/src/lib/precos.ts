/**
 * O preco do site do consultor. UM lugar so.
 *
 * Sem server-only de proposito: o formulario (client) e o preco do topo da
 * pagina (server) leem daqui, junto com quem cria a assinatura no Asaas. Antes
 * o numero estava escrito em tres arquivos — trocar em dois e esquecer o
 * terceiro faria a pagina anunciar um valor e a cobranca nascer com outro.
 *
 * ⚠️ VALOR DE TESTE ATIVO (12/08/2026): R$ 5 e o MINIMO que o Asaas aceita —
 * medido chamando /subscriptions com 0,50 / 1 / 2 / 3 / 4 (todos recusados) e 5
 * (aceito). Esta assim a pedido do dono, para ele fechar uma contratacao real
 * sem gastar R$ 80. VOLTAR PARA 80 quando ele avisar que terminou o teste.
 */
export const MENSALIDADE = 5

/** O que estava valendo antes do teste, para nao depender da memoria de ninguem. */
export const MENSALIDADE_OFICIAL = 80
