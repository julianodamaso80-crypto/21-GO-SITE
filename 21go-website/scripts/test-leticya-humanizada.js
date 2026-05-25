// =============================================================================
// TESTE OFFLINE — Leticya v2 respondendo como humano
// Roda 10 cenários reais (extraídos das 263 conversas analisadas)
// SEM disparar mensagem pra cliente nenhum. Saída em arquivo + console.
// =============================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Lê .env.local
function loadEnvLocal() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnvLocal();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('Sem OPENROUTER_API_KEY. Aborta.');
  process.exit(1);
}

// Cenários reais (mensagens-tipo observadas nas 263 conversas)
const CENARIOS = [
  {
    id: 1,
    titulo: 'Lead do site, Honda moto, quer contratar',
    input: `Olá! Fiz uma simulação no site.\nNome: Cicero Virginio\nWhatsApp: (21) 99776-6932\nPlaca: RKO7E86\nSeguro/proteção atual: Suhai\nVeículo: HONDA CG 160 FAN Flex\nFIPE: R$ 17.500\nPlano: VIP Moto até 400cc\nMensalidade: R$ 186,84/mês\nAtivação: R$ 419,91\nQuero contratar!`,
    contact_name: 'Cicero',
  },
  {
    id: 2,
    titulo: 'Lead WhatsApp frio — só pede cotação',
    input: 'Bom dia, gostaria de uma cotação',
    contact_name: 'Matheus',
  },
  {
    id: 3,
    titulo: 'Objeção preço — não tem o valor da ativação',
    input: 'Ativação tá 519 com rastreador, não tenho esse valor agora. Parcela?',
    contact_name: 'Pedro',
    must_contain: /se eu conseguir.*desconto.*que dia.*(?:senhor|você).*(?:fechar|fecha)/i,
  },
  {
    id: 3.1,
    titulo: 'Objeção preço — variante "tá caro"',
    input: 'Tá caro pra mim, consegue um desconto?',
    contact_name: 'Ricardo',
    must_contain: /se eu conseguir.*desconto.*que dia.*(?:senhor|você).*(?:fechar|fecha)/i,
  },
  {
    id: 3.2,
    titulo: 'Objeção preço — comparou com concorrente',
    input: 'Na Alamo me ofereceram a R$ 250, vocês conseguem fazer mais barato?',
    contact_name: 'Lucas',
    must_contain: /se eu conseguir.*desconto.*que dia.*(?:senhor|você).*(?:fechar|fecha)/i,
  },
  {
    id: 4,
    titulo: 'Veículo rejeitado — Fiat Freemont',
    input: 'Bom dia. Tenho um Fiat Freemont 2012, quero fazer proteção',
    contact_name: 'Fernanda',
  },
  {
    id: 5,
    titulo: 'Cliente reclamando demora',
    input: 'Já mandei 3 mensagens e ninguém responde. Estou vendo com outras empresas, até me responderam rápido.',
    contact_name: 'Joana',
  },
  {
    id: 6,
    titulo: 'Vai pensar / falar com cônjuge',
    input: 'Vou mandar essas informações pra meu esposo e retorno o contato, ok?',
    contact_name: 'Dayana',
  },
  {
    id: 7,
    titulo: 'Confiança — viu vídeo do Pastor',
    input: 'Vocês são confiáveis? Vi um vídeo do Pastor no Instagram',
    contact_name: 'Roberto',
  },
  {
    id: 8,
    titulo: 'Quer ser consultor (funil APN)',
    input: 'Olá, gostaria de ser consultor da 21Go. Como faço pra participar do treinamento?',
    contact_name: 'Janaina',
  },
  {
    id: 9,
    titulo: 'EMERGÊNCIA — sinistro em andamento',
    input: 'Minha moto foi roubada agora! Preciso de ajuda urgente!',
    contact_name: 'Carlos',
  },
  {
    id: 10,
    titulo: 'Pergunta sobre cota de participação',
    input: 'Qual a franquia de vocês? E pra carro elétrico fica como?',
    contact_name: 'Bruno',
  },
];

async function carregaPersona() {
  const c = new Client({
    host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432,
    user: 'postgres.dsclaxtvcbbuxmtmpxpf', password: 'GuI1616GuI@',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`
    SELECT persona_description, persona_version, default_model, classifier_model,
      glossary_required, glossary_forbidden, temperature
    FROM ai.agents WHERE id='pre-venda'
  `);
  await c.end();
  return r.rows[0];
}

function montaSystemPrompt(agent, contactName) {
  const required = (agent.glossary_required || []).join(', ');
  const forbidden = (agent.glossary_forbidden || []).join(', ');
  return [
    agent.persona_description,
    '',
    '═══ COMPLIANCE SUSEP (HARD CONSTRAINT) ═══',
    `USAR sempre: ${required}`,
    `NUNCA usar: ${forbidden}`,
    '',
    '═══ FORMATO DE RESPOSTA (anti-robô) ═══',
    '- Máximo 3 bolhas curtas separadas por uma linha em branco (\\n\\n)',
    '- Cada bolha 1-3 linhas, máx 280 caracteres',
    '- Sem bullets, sem markdown bold (asterisco), sem numeração 1) 2)',
    '- Tom carioca informal-profissional, "o senhor"/"a senhora"',
    '- Emoji raramente, só se fluir',
    '- No primeiro contato se identifica como atendente VIRTUAL se perguntada',
    '',
    contactName ? `═══ CONTEXTO ═══\nNome do cliente: ${contactName}` : '',
  ].filter(Boolean).join('\n');
}

async function chamaOpenRouter(systemPrompt, userMessage, model = 'anthropic/claude-sonnet-4.5') {
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://21go.site',
      'X-Title': 'Leticya v2 humanização test',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.78,
      max_tokens: 800,
    }),
  });
  const latency = Date.now() - t0;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  return {
    text: j.choices?.[0]?.message?.content || '',
    usage: j.usage || {},
    latency_ms: latency,
    model: j.model || model,
  };
}

function quebraEmBolhas(text) {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function analisaResposta(text, cenario) {
  const issues = [];
  // Frase-âncora obrigatória (se cenário definiu must_contain)
  if (cenario && cenario.must_contain && !cenario.must_contain.test(text)) {
    issues.push(`FRASE_ANCORA_FALTANDO: esperado regex ${cenario.must_contain.source}`);
  }
  // Compliance SUSEP
  const FORBIDDEN = /\b(seguro|seguros|apólice|apolice|seguradora|seguradoras|indenização|indenizacao|prêmio|premio|segurado|segurada)\b/i;
  const ALLOWED_CONTEXT = /(não\s+é\s+seguro|diferença\s+(de|do|com)\s+seguro|comparado\s+(com|ao)\s+seguro|tinha\s+seguro\s+na)/i;
  const forbMatch = text.match(FORBIDDEN);
  if (forbMatch && !ALLOWED_CONTEXT.test(text)) {
    issues.push(`SUSEP_VIOLATION: "${forbMatch[0]}"`);
  }
  // Cheira a bot
  const BOT_PHRASES = [
    /estou (aqui|à disposição|disponível) para (te |o )?ajud/i,
    /como posso (te )?(auxiliar|ajudar mais)/i,
    /aguardo (seu )?retorno/i,
    /tenha um (excelente|ótimo) dia/i,
    /atenciosamente/i,
    /espero ter ajudado/i,
    /em caso de dúvidas? não hesite/i,
  ];
  for (const re of BOT_PHRASES) {
    if (re.test(text)) issues.push(`BOT_PHRASE: ${re.source}`);
  }
  // Markdown bold com asterisco (vira lixo no WhatsApp)
  if (/\*[^*\n]+\*/.test(text)) {
    issues.push('MARKDOWN_BOLD detectado (asterisco vira literal no WhatsApp)');
  }
  // Bullet points
  if (/^[\s]*[•\-*]\s/m.test(text)) {
    issues.push('BULLET_POINT detectado');
  }
  // Bolha muito longa
  const bubbles = quebraEmBolhas(text);
  for (let i = 0; i < bubbles.length; i++) {
    if (bubbles[i].length > 320) {
      issues.push(`BOLHA_${i + 1}_LONGA: ${bubbles[i].length} chars (máx 280)`);
    }
  }
  // Sem bolha = parágrafo único gigante
  if (bubbles.length === 1 && text.length > 200) {
    issues.push('UNICA_BOLHA: resposta não fragmentada');
  }
  return { issues, bubbles_count: bubbles.length };
}

(async () => {
  console.log('Carregando persona v2 do banco...');
  const agent = await carregaPersona();
  console.log(`Persona ${agent.persona_version} | ${agent.persona_description.length} chars | modelo: ${agent.default_model}\n`);

  const resultados = [];
  for (const cen of CENARIOS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`CENARIO ${cen.id}: ${cen.titulo}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`INPUT:\n${cen.input}`);

    const system = montaSystemPrompt(agent, cen.contact_name);
    let out;
    try {
      out = await chamaOpenRouter(system, cen.input, agent.default_model || 'anthropic/claude-sonnet-4.5');
    } catch (e) {
      console.log(`ERRO: ${e.message}`);
      resultados.push({ ...cen, error: e.message });
      continue;
    }

    const analise = analisaResposta(out.text, cen);
    const bubbles = quebraEmBolhas(out.text);

    console.log(`\nRESPOSTA (${out.latency_ms}ms, ${out.usage.total_tokens || '?'} tokens):`);
    for (let i = 0; i < bubbles.length; i++) {
      console.log(`  [${i + 1}] ${bubbles[i]}`);
    }
    if (analise.issues.length > 0) {
      console.log(`\nFLAGS DA ANALISE (${analise.issues.length}):`);
      for (const iss of analise.issues) console.log(`  - ${iss}`);
    } else {
      console.log('\n  [analise]: OK (sem flags)');
    }

    resultados.push({
      cenario: cen.id,
      titulo: cen.titulo,
      input: cen.input,
      response_text: out.text,
      bubbles,
      bubbles_count: bubbles.length,
      issues: analise.issues,
      latency_ms: out.latency_ms,
      tokens: out.usage,
      model: out.model,
    });
  }

  // Salva resultado em arquivo pra revisar
  const outPath = path.join(__dirname, '..', 'tmp_test_leticya_v2.json');
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    persona_version: agent.persona_version,
    persona_chars: agent.persona_description.length,
    model: agent.default_model,
    resultados,
  }, null, 2));
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Resultados salvos em: ${outPath}`);

  // Resumo
  const totalIssues = resultados.reduce((acc, r) => acc + (r.issues?.length || 0), 0);
  const okCount = resultados.filter(r => r.issues?.length === 0 && !r.error).length;
  console.log(`\nRESUMO: ${okCount}/${resultados.length} cenários sem flags. Total de issues: ${totalIssues}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
