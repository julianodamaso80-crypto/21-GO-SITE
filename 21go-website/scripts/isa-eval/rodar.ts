/**
 * Eval da Isa: perguntas REAIS (das conversas de teste de 11-12/09/2026 e do documento das 71)
 * passam pelo cérebro de verdade (OpenRouter) e cada resposta é conferida contra o que o dono
 * definiu. Sai uma nota. Roda ANTES de cada liberação — "acho que tá bom" vira "42/45".
 *
 *   node --import ./scripts/isa-eval/loader.mjs scripts/isa-eval/rodar.ts            # modelo do código
 *   ISA_MODELO=google/gemini-3.1-pro-preview node --import ./scripts/isa-eval/loader.mjs scripts/isa-eval/rodar.ts
 *   ... rodar.ts sede lavagem     # só os casos cujo id contém essas palavras
 *
 * Precisa de OPENROUTER_API_KEY (lê o .env.local). Não toca em banco nem em WhatsApp.
 */
import { readFileSync } from 'node:fs'
import { pensar, type SaidaCerebro } from '@/lib/isa/cerebro'
import { montarFatos, type Fatos } from '@/lib/isa/fatos.regras'
import { PLAN_INFO, type PlanId } from '@/data/pricing'
import type { MensagemHistorico } from '@/lib/isa/banco'

// .env.local sem dependência
try {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  /* sem .env.local: a chave tem que vir do ambiente */
}

const feats = (id: PlanId) => PLAN_INFO[id].features
const ka: Fatos = montarFatos({
  marca: 'Ford', modelo: 'Ka 1.5 Sedan SE 12V Flex 4p Aut.', ano: 2019, fipe: 52754, combustivel: null, leilao: false, carroApp: false, estado: null,
  planos: [
    { id: 'basico', nome: 'Básico', mensal: 172.7, beneficios: feats('basico') },
    { id: 'do-seu-jeito', nome: 'Do Seu Jeito', mensal: 184.7, beneficios: feats('do-seu-jeito') },
    { id: 'vip', nome: 'VIP', mensal: 227.41, beneficios: feats('vip') },
    { id: 'premium', nome: 'Premium', mensal: 292.53, beneficios: feats('premium') },
  ],
  ativacaoReferencia: 277.41, ativacaoPorPlano: { basico: 277.41, 'do-seu-jeito': 277.41, vip: 277.41, premium: 342.53 }, desconto50: null,
  numerosDosBeneficios: [5000, 10000, 50000, 100000],
})
const moto: Fatos = montarFatos({
  marca: 'Honda', modelo: 'CG 160 TITAN', ano: 2026, fipe: 21824, combustivel: null, leilao: false, carroApp: false, estado: null,
  planos: [{ id: 'moto-400', nome: 'VIP Moto até 400cc', mensal: 130.68, beneficios: feats('moto-400') }],
  ativacaoReferencia: 249, ativacaoPorPlano: { 'moto-400': 249 }, desconto50: null, numerosDosBeneficios: [15000],
})

interface Caso {
  id: string
  ctx: 'ka' | 'moto' | 'sem'
  /** Mensagens anteriores (a última é sempre a pergunta do cliente). */
  antes?: ['in' | 'out', string][]
  pergunta: string
  espera?: RegExp[]
  evita?: RegExp[]
  gatilho?: SaidaCerebro['gatilho']
  /** Fora do Rio (sem adesivo). */
  foraDoRio?: boolean
  pagaHoje?: number
}

const CASOS: Caso[] = [
  { id: 'sede', ctx: 'ka', pergunta: 'onde fica a sede de vocês?', espera: [/jorge sampaio/i, /campo grande/i] },
  { id: 'oficina', ctx: 'ka', pergunta: 'a oficina é de vocês ou eu levo na minha?', espera: [/pr[óo]pria/i, /cnpj/i], evita: [/confirmar/i] },
  { id: 'lavagem', ctx: 'ka', pergunta: 'tem direito a lavagem?', espera: [/2 lavagens|duas lavagens/i, /ordem de chegada/i], evita: [/confirmar/i] },
  { id: 'parabrisa', ctx: 'ka', pergunta: 'cobre o para-brisa?', espera: [/70%/], gatilho: null },
  { id: 'terceiros-mais', ctx: 'ka', pergunta: 'dá pra aumentar os terceiros pra 150 mil?', espera: [/49,90/, /50 mil/i], gatilho: null },
  { id: 'terceiros-moto', ctx: 'moto', pergunta: 'moto tem danos a terceiros?', espera: [/22,90/, /10 mil/i], gatilho: null },
  { id: 'carencia', ctx: 'ka', pergunta: 'tem carência?', espera: [/72 ?h|72 horas/i, /roubo/i] },
  { id: 'fidelidade', ctx: 'ka', pergunta: 'tem fidelidade ou multa pra cancelar?', espera: [/(n[ãa]o tem|sem) fidelidade/i, /10 dias/] },
  { id: 'cota-valor', ctx: 'ka', pergunta: 'se eu bater quanto eu pago?', espera: [/6%/, /3\.165,24/] },
  { id: 'cota-pt', ctx: 'ka', pergunta: 'se der perda total eu pago cota?', espera: [/n[ãa]o/i, /cota|nada/i] },
  { id: 'uber', ctx: 'ka', pergunta: 'aceita carro de aplicativo?', espera: [/aceit/i, /100%/], evita: [/80%/] },
  { id: 'leilao', ctx: 'ka', pergunta: 'aceita carro de leilão?', espera: [/aceit/i, /80%|20%/] },
  { id: 'moto-leilao', ctx: 'moto', pergunta: 'e moto de leilão, aceita?', espera: [/n[ãa]o/i], evita: [/confirmar/i] },
  { id: 'remarcado', ctx: 'ka', pergunta: 'carro com chassi remarcado aceita?', espera: [/aceit/i, /80%|20%/], evita: [/n[ãa]o aceitamos/i] },
  { id: 'crlv-atrasado', ctx: 'ka', pergunta: 'meu documento do carro tá atrasado, aceita?', espera: [/2023/] },
  { id: 'atpv', ctx: 'ka', pergunta: 'serve o recibo de compra e venda no lugar do documento?', espera: [/n[ãa]o|s[óo] (o )?crlv/i] },
  { id: 'sem-cnh', ctx: 'ka', pergunta: 'não tenho CNH, posso fazer?', espera: [/pode|sim|normal/i], gatilho: null },
  { id: 'cnh-vencida', ctx: 'ka', pergunta: 'minha CNH tá vencida, tem problema?', espera: [/n[ãa]o tem problema/i] },
  { id: 'susep', ctx: 'ka', pergunta: 'vocês são regulamentados?', espera: [/SUSEP/] },
  { id: 'cooperativa', ctx: 'ka', pergunta: 'vocês são cooperativa?', espera: [/n[ãa]o somos cooperativa/i] },
  { id: 'robo', ctx: 'ka', pergunta: 'você é um robô?', gatilho: 'robo' },
  { id: 'desconto', ctx: 'ka', pergunta: 'consegue um desconto na ativação pra mim?', gatilho: 'desconto', espera: [/supervisor/i] },
  { id: 'desconto-mensalidade', ctx: 'ka', pergunta: 'dá desconto na mensalidade?', espera: [/tabelad/i, /5 dias/i] },
  { id: 'app-quando', ctx: 'ka', pergunta: 'quando eu consigo acessar o aplicativo?', espera: [/72 horas [úu]teis|72h [úu]teis/i] },
  { id: 'zero-km', ctx: 'sem', pergunta: 'vou retirar um zero km amanhã, dá pra ativar no mesmo dia?', espera: [/mesmo dia|j[áa] sai|no dia|d[áa] sim/i], evita: [/18 ?h/] },
  { id: 'motorhome', ctx: 'sem', pergunta: 'aceita motorhome?', espera: [/n[ãa]o/i], evita: [/confirmar/i] },
  { id: 'reboque-ida-volta', ctx: 'ka', pergunta: 'os 1000 km do guincho é ida e volta?', espera: [/500/] },
  { id: 'reboque-saidas', ctx: 'ka', pergunta: 'quantas vezes posso usar o guincho no mês?', espera: [/1 (saída|vez|pra colis)/i, /3 (saídas|vezes|pra emerg)/i, /30 dias/] },
  { id: 'taxi', ctx: 'ka', pergunta: 'como funciona o táxi?', espera: [/2 pessoas/i] },
  { id: 'retorno-domicilio', ctx: 'ka', pergunta: 'e se eu passar mal dirigindo?', espera: [/20 ?km/, /retorno a domic[íi]lio/i] },
  { id: 'carro-amigo', ctx: 'ka', pergunta: 'o que é o carro amigo?', gatilho: 'sem_informacao', espera: [/confirmar/i] },
  { id: 'som-do-carro', ctx: 'ka', pergunta: 'cobre roubo do som e das rodas?', gatilho: 'sem_informacao', espera: [/confirmar/i] },
  { id: 'indicacao', ctx: 'ka', pergunta: 'se eu indicar um amigo ganho o que?', espera: [/50 reais|50,00|R\$ ?50/i, /10%/] },
  { id: 'pagamento', ctx: 'ka', pergunta: 'como eu pago a mensalidade?', espera: [/boleto/i, /aplicativo|app\b/i, /pix/i], evita: [/carn[êe]|whatsapp/i] },
  { id: 'vencimento', ctx: 'ka', pergunta: 'qual o dia do vencimento?', espera: [/\b10\b/, /\b20\b/] },
  { id: 'fora-do-rio-oficina', ctx: 'ka', foraDoRio: true, pergunta: 'moro em Minas, se eu bater como faço?', espera: [/0800/, /cnpj/i] },
  { id: 'rastreador-instalacao', ctx: 'ka', pergunta: 'onde instala o rastreador?', espera: [/sede|campo grande/i, /casa|resid[êe]ncia|t[ée]cnico/i] },
  { id: 'adesivo-mg', ctx: 'ka', foraDoRio: true, pergunta: 'quero colar o adesivo mas moro em Minas', espera: [/5 dias/i], evita: [/15%|10%/] },
  { id: 'beneficios-sem-placa', ctx: 'sem', pergunta: 'quais os benefícios de vocês?', espera: [/reboque/i, /chaveiro/i, /placa/i], evita: [/confirmar/i] },
  { id: 'vou-pensar', ctx: 'ka', pergunta: 'vou pensar e depois te falo', espera: [/sem pressa|fica salva|me chama/i], evita: [/[úu]ltima|n[ãa]o me esque/i], gatilho: null },
  { id: 'ta-caro', ctx: 'ka', pergunta: 'achei caro', espera: [/5 dias|tabelad/i], gatilho: null },
  { id: 'paga-hoje', ctx: 'ka', antes: [['in', 'tenho seguro na porto'], ['out', 'e quanto você paga hoje?']], pergunta: '650', pagaHoje: 650, espera: [/422,59|477,30|465,30|357,47/] },
  { id: 'confiavel', ctx: 'ka', pergunta: 'vocês são confiáveis? e se a empresa quebrar?', espera: [/20 anos|SUSEP/i] },
  { id: 'seguro-x-protecao', ctx: 'ka', pergunta: 'seguro não é melhor que proteção?', espera: [/100% da FIPE|livre condutor|SUSEP/i] },
  { id: 'vistoria', ctx: 'ka', pergunta: 'como funciona a vistoria?', espera: [/fotos?/i, /VISTO/i] },
]

const ROBO = /posso te ajudar com mais alguma|fico [àa] disposi|estou aqui pra (te )?ajudar|^entendi\b|^que legal\b|[óo]tima escolha/im

function historico(c: Caso): MensagemHistorico[] {
  const msgs: ['in' | 'out', string][] = [...(c.antes ?? []), ['in', c.pergunta]]
  return msgs.map(([d, content], i) => ({
    id: `m${i}`,
    whatsapp_message_id: `wamid.${i}`,
    direction: d === 'in' ? 'inbound' : 'outbound',
    sender: d === 'in' ? null : 'isa',
    message_type: 'text',
    content,
    raw_payload: null,
    criada_em: new Date(Date.now() - (msgs.length - i) * 60_000).toISOString(),
  }))
}

async function rodarCaso(c: Caso): Promise<{ ok: boolean; motivos: string[]; resposta: string; gatilho: string | null }> {
  const fatos = c.ctx === 'ka' ? ka : c.ctx === 'moto' ? moto : null
  const s = await pensar({
    nome: 'Juliano Damaso',
    genero: null,
    fatos,
    jaGanhouDesconto: false,
    falaDeAdesivo: !c.foraDoRio,
    historico: historico(c),
    agora: new Date(),
    cumprimentar: false,
    pagaHoje: c.pagaHoje ?? null,
  })
  const motivos: string[] = []
  for (const re of c.espera ?? []) if (!re.test(s.resposta)) motivos.push(`faltou ${re}`)
  for (const re of c.evita ?? []) if (re.test(s.resposta)) motivos.push(`não podia ${re}`)
  if (c.gatilho !== undefined && s.gatilho !== c.gatilho) motivos.push(`gatilho ${s.gatilho} (esperado ${c.gatilho})`)
  if (ROBO.test(s.resposta)) motivos.push('frase de robô')
  if (s.reprovados.length) motivos.push(`validador reprovou: ${s.reprovados.join(', ')}`)
  if (/deixa eu confirmar aqui/.test(s.resposta) && c.gatilho !== 'sem_informacao') motivos.push('caiu na resposta segura (JSON ilegível 2x)')
  return { ok: motivos.length === 0, motivos, resposta: s.resposta, gatilho: s.gatilho }
}

async function main() {
  const filtro = process.argv.slice(2)
  const casos = filtro.length ? CASOS.filter((c) => filtro.some((f) => c.id.includes(f))) : CASOS
  const modelo = process.env.ISA_MODELO || 'google/gemini-3.1-pro-preview (padrão do cérebro)'
  console.log(`eval da Isa — ${casos.length} casos — modelo ${modelo}\n`)
  let ok = 0
  const fila = [...casos]
  const resultados: { c: Caso; r: Awaited<ReturnType<typeof rodarCaso>> }[] = []
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let c = fila.shift(); c; c = fila.shift()) {
        try {
          resultados.push({ c, r: await rodarCaso(c) })
        } catch (err) {
          resultados.push({ c, r: { ok: false, motivos: [`erro: ${err instanceof Error ? err.message : String(err)}`], resposta: '', gatilho: null } })
        }
      }
    }),
  )
  resultados.sort((a, b) => casos.indexOf(a.c) - casos.indexOf(b.c))
  for (const { c, r } of resultados) {
    if (r.ok) ok++
    console.log(`${r.ok ? '✔' : '✖'} ${c.id}${r.gatilho ? ` [${r.gatilho}]` : ''}`)
    if (!r.ok) {
      for (const m of r.motivos) console.log(`     - ${m}`)
      console.log(`     resposta: ${r.resposta.replace(/\n+/g, ' ⏎ ').slice(0, 320)}`)
    }
  }
  console.log(`\nNOTA: ${ok}/${casos.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
