/**
 * Quem clica em "Quero Ser Consultor" nos sites .site — logica pura.
 *
 * O lead preenche o formulario de /seja-consultor e o site abre o WhatsApp da casa (4824) com
 * o texto ja montado. Quando ELE envia, o webhook da Evolution reconhece o texto aqui e
 * responde com o treinamento e o link do grupo. Nada sai sozinho: e sempre resposta a uma
 * mensagem que o lead mandou (REGRA 0.1 — nenhum disparo sem clique).
 *
 * Se ele responder qualquer coisa depois, ouve UMA vez que o atendimento e virtual e que as
 * informacoes sao passadas no grupo. Dai em diante o robo cala: conversa em loop e sinal de
 * spam pro WhatsApp, e quem quiser falar de verdade a Leticya ve no celular dela.
 *
 * Client-safe: sem `node:*` e sem banco, pra dar teste.
 */

import type { Cumprimento } from '@/lib/isa/hora.regras'

export const LINK_GRUPO =
  'https://chat.whatsapp.com/JibpbvUskJ74KtZ6zSHMEq?s=cl&p=i&mlu=0&amv=2'

/** Nao repetir as boas-vindas pra quem mandou o formulario duas vezes seguidas. */
const JANELA_HORAS = 24

/**
 * A assinatura do formulario (`seja-consultor/page.tsx`): "Olá! Acabei de me cadastrar como
 * consultor 21Go.". Casa sem acento e sem o "Olá!" porque o cliente as vezes edita o comeco
 * da mensagem antes de enviar.
 *
 * ⚠️ Se a copy do formulario mudar, esta regex muda junto — senao o gatilho morre em silencio.
 */
const ASSINATURA = /cadastr\w*\s+como\s+consultor/i

export function ehCadastroDeConsultor(texto: string | null | undefined): boolean {
  return ASSINATURA.test(texto || '')
}

export function mensagemBoasVindas(saudacao: Cumprimento): string {
  const abertura = saudacao.charAt(0).toUpperCase() + saudacao.slice(1)
  return (
    `${abertura}! 👋\n\n` +
    'Que bom que você quer ser consultor 21Go!\n\n' +
    'Nosso treinamento é online, todas as terças e quartas às 20h.\n\n' +
    'Já te passo o link do nosso grupo — é por lá que a gente avisa tudo, e no dia do treinamento eu mando o link da sala:\n' +
    `${LINK_GRUPO}\n\n` +
    'Ao entrar, informe que sua indicação é da consultora Leticya Thayene.'
  )
}

export function mensagemAtendimentoVirtual(): string {
  return (
    'Sou o atendimento virtual da 21Go 🤖\n\n' +
    'Todas as informações sobre comissão, produto e como começar são passadas dentro do grupo e no treinamento das terças e quartas às 20h.\n\n' +
    'Entra no grupo que lá você tira todas as suas dúvidas 👇\n' +
    LINK_GRUPO
  )
}

/**
 * A trava de ativacao. Nasce fechada: sem `CONSULTOR_BOT_ATIVO=on` so a allowlist recebe, e
 * sem allowlist nao recebe ninguem. Mesmo protocolo da Isa — o dono testa antes de liberar.
 */
export function podeResponder(
  telefone: string,
  env: { ativo?: string; allowlist?: string },
): boolean {
  const numero = telefone.replace(/\D/g, '')
  if (!numero) return false
  const lista = (env.allowlist || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean)
  if (lista.includes(numero)) return true
  return env.ativo === 'on'
}

/** Formulario reenviado dentro de 24 h nao ganha a mensagem de novo. */
export function precisaBoasVindas(boasVindasEm: Date | null, agora: Date): boolean {
  if (!boasVindasEm) return true
  return agora.getTime() - boasVindasEm.getTime() > JANELA_HORAS * 60 * 60 * 1000
}

export type AcaoRecrutamento = 'boas_vindas' | 'atendimento_virtual' | 'nada'

/**
 * A decisao inteira num lugar so, sem banco e sem rede.
 *
 * - texto do formulario → boas-vindas (uma vez a cada 24 h)
 * - qualquer outra coisa de quem ja recebeu as boas-vindas e ainda nao ouviu o aviso → aviso
 * - o resto (inclusive gente que nunca veio pelo botao) → nada, o 4824 e da casa
 */
export function decidir(p: {
  texto: string | null
  boasVindasEm: Date | null
  avisoVirtualEm: Date | null
  agora: Date
}): AcaoRecrutamento {
  if (ehCadastroDeConsultor(p.texto)) {
    return precisaBoasVindas(p.boasVindasEm, p.agora) ? 'boas_vindas' : 'nada'
  }
  if (p.boasVindasEm && !p.avisoVirtualEm) return 'atendimento_virtual'
  return 'nada'
}
