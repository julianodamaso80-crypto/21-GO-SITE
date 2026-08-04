/**
 * Trava de regressao dos limites de palavra com acento.
 *
 * `\b` em JavaScript so reconhece [A-Za-z0-9_]. Padroes que comecam ou terminam em
 * caractere acentuado — `/\b[ôo]nibus\b/`, `/\bé seguro\b/` — NUNCA casam a versao
 * acentuada. Os dois existiam no codigo: o pos-processador deixava "ônibus" passar e o
 * artigo era reprovado por escopo, queimando a pauta; e o hard-block de "é seguro"
 * jamais disparou em 173 artigos.
 *
 * Uso: node src/scripts/test-regex-acentos.mjs
 */

const VEICULOS = [
  { pattern: /(?<![\p{L}\p{N}])caminh(?:ão|ões|ao|oes)(?![\p{L}\p{N}])/giu, replacement: 'carro de carga leve' },
  { pattern: /(?<![\p{L}\p{N}])carretas?(?![\p{L}\p{N}])/giu, replacement: 'utilitario' },
  { pattern: /(?<![\p{L}\p{N}])(?:micro-?)?[ôo]nibus(?![\p{L}\p{N}])/giu, replacement: 'van' },
  { pattern: /(?<![\p{L}\p{N}])transportadoras?(?![\p{L}\p{N}])/giu, replacement: 'empresa de entrega' },
];

function enforce(texto) {
  let out = texto;
  for (const f of VEICULOS) {
    const novo = out.replace(f.pattern, f.replacement);
    if (novo !== out) out = novo;
  }
  return out;
}

const CASOS = [
  { texto: 'Evite os pontos cegos de ônibus na cidade.', deveMudar: true, nome: 'ônibus acentuado' },
  { texto: 'Evite os pontos cegos de onibus na cidade.', deveMudar: true, nome: 'onibus sem acento' },
  { texto: 'Nao atendemos caminhão nem carreta.', deveMudar: true, nome: 'caminhão + carreta' },
  { texto: 'A transportadora local faz entregas.', deveMudar: true, nome: 'transportadora' },
  { texto: 'O microônibus escolar tambem entra.', deveMudar: true, nome: 'microônibus' },
  { texto: 'A moto tem autonomia boa e o carro tambem.', deveMudar: false, nome: 'texto limpo' },
];

let falhas = 0;

console.log('== substituicao de veiculo pesado ==');
for (const c of CASOS) {
  const saida = enforce(c.texto);
  const mudou = saida !== c.texto;
  const ok = mudou === c.deveMudar;
  if (!ok) falhas++;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${c.nome.padEnd(20)} -> ${saida}`);
}

// Idempotencia: o Writer chama enforce DUAS vezes (antes e depois do internal-linker).
// Com `pattern.test()` + flag /g em constante de modulo, o lastIndex sobrevivia entre
// chamadas e a segunda passada — a que e salva no banco — pulava a substituicao.
console.log('\n== idempotencia (2 chamadas seguidas) ==');
const txt = 'Evite os pontos cegos de ônibus na cidade.';
const p1 = enforce(txt);
const p2 = enforce(txt);
const okIdem = p1 === p2 && !/[ôo]nibus/i.test(p2);
if (!okIdem) falhas++;
console.log(`  ${okIdem ? 'OK   ' : 'FALHA'} 1a="${p1}" | 2a="${p2}"`);

console.log(falhas === 0 ? '\ntodos corretos' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
