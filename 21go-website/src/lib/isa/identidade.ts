import 'server-only'
import { identidadeDoAmbiente, tabelasDoBot, type IdentidadeBot, type TabelasDoBot } from '@/lib/isa/identidade.regras'
import { etiquetasDoBot, type Etiqueta } from '@/lib/isa/etiquetas.regras'
import { funilDoBot, type FunilDoBot } from '@/lib/isa/funil.regras'

/**
 * A identidade deste container (Isa na casa, Mariana no container dela), lida UMA vez do env.
 * Identidade que embola com a casa derruba o import de proposito (errosDaIdentidade): melhor nao
 * subir do que responder cliente do Gabriel no schema da Isa.
 */
export const IDENTIDADE: IdentidadeBot = identidadeDoAmbiente(process.env)

/** Tabelas por-bot qualificadas pelo schema da identidade. Unico valor de identidade interpolado em SQL. */
export const TAB: TabelasDoBot = tabelasDoBot(IDENTIDADE.schema)

/** Etiquetas e colunas do funil deste bot (Mariana: Gabriel no lugar da Leticya, sem Guilherme). */
export const ETIQUETAS_DO_BOT: readonly Etiqueta[] = etiquetasDoBot(IDENTIDADE)
export const FUNIL_DO_BOT: FunilDoBot = funilDoBot(IDENTIDADE)
