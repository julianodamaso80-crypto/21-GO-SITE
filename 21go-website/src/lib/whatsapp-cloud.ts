import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Lógica pura da WhatsApp Cloud API (Meta) usada pelo robô de atendimento (Isa).
 * Sem I/O aqui: a rota lê o env e o corpo, e este módulo só decide.
 *
 * O número da Isa é o 98004-0964 (phone_number_id 1457563414097446). O app "21 GO" também
 * atende o número do CRM, então todo evento é filtrado pelo phone_number_id — nunca pela WABA
 * nem por listagem: a WABA de nome bonito contém um número assinado por pessoa física.
 */

/** HMAC SHA-256 do corpo BRUTO com o App Secret — reserializar o JSON muda os bytes e reprova tudo. */
export function assinaturaConfere(
  corpoBruto: string,
  cabecalho: string | null | undefined,
  segredo: string,
): boolean {
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false
  const esperado = Buffer.from(createHmac('sha256', segredo).update(corpoBruto).digest('hex'), 'utf8')
  const recebido = Buffer.from(cabecalho.slice('sha256='.length), 'utf8')
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

export interface MensagemRecebida {
  id: string
  from: string
  nome: string | null
  tipo: string
  texto: string | null
  mediaId: string | null
  /** Botao de template (quick reply): o codigo que a Isa pos no botao ao mandar o alerta. */
  payload: string | null
  timestamp: string
}

type Objeto = Record<string, unknown>
const obj = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Mensagens recebidas pelo número informado. Status (sent/delivered/read) e outros números ficam de fora. */
export function mensagensDoNumero(payload: unknown, phoneNumberId: string): MensagemRecebida[] {
  const saida: MensagemRecebida[] = []
  for (const entry of lista(obj(payload)?.entry)) {
    for (const change of lista(obj(entry)?.changes)) {
      const value = obj(obj(change)?.value)
      if (str(obj(value?.metadata)?.phone_number_id) !== phoneNumberId) continue

      const nomes = new Map<string, string>()
      for (const c of lista(value?.contacts)) {
        const waId = str(obj(c)?.wa_id)
        const nome = str(obj(obj(c)?.profile)?.name)
        if (waId && nome) nomes.set(waId, nome)
      }

      for (const bruto of lista(value?.messages)) {
        const m = obj(bruto)
        const id = str(m?.id)
        const from = str(m?.from)
        const tipo = str(m?.type)
        if (!m || !id || !from || !tipo) continue

        const corpo = obj(m[tipo])
        saida.push({
          id,
          from,
          nome: nomes.get(from) ?? null,
          tipo,
          texto: str(corpo?.body) ?? str(corpo?.caption) ?? str(corpo?.text) ?? null,
          mediaId: str(corpo?.id),
          payload: str(corpo?.payload),
          timestamp: str(m.timestamp) ?? '',
        })
      }
    }
  }
  return saida
}

/**
 * Trava de teste. Só sai do modo teste com ISA_MODO_TESTE="false" explícito: variável ausente
 * continua em teste, e allowlist ausente não libera ninguém. Um deploy que perca o env emudece
 * o bot em vez de soltá-lo em cima de cliente.
 */
export function podeResponder(
  from: string,
  config: { modoTeste: string | undefined; allowlist: string | undefined },
): boolean {
  if (config.modoTeste === 'false') return true
  const permitidos = (config.allowlist ?? '').split(',').map((n) => n.trim()).filter(Boolean)
  return permitidos.includes(from)
}
