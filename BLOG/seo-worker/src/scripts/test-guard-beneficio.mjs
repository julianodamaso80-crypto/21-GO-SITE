/**
 * Trava do guard "numero de beneficio sem dizer o plano" (Agente 06).
 *
 * Existe porque um artigo afirmou "segundo a 21Go, o guincho 24h cobre ate 400km" —
 * numero real, mas do plano Jeito; no Basico sao 200km. Publicar como regra geral vira
 * reclamacao de associado.
 *
 * Os dois lados importam. A primeira versao usava verbos genericos ("cobre", "inclui")
 * no gatilho e barrou "a garantia da BYD cobre motor e bateria por 8 anos ou 150.000
 * km" — garantia de FABRICA, nao beneficio nosso — queimando pauta boa do cluster BYD.
 *
 * Uso: node src/scripts/test-guard-beneficio.mjs
 */

const PLANO_MENCIONADO = /\b(b[aá]sico|jeito|vip|premium|conforme o plano|varia (conforme|por|de acordo com) o plano|depende do plano|cada plano)\b/i;
const SERVICO_NOSSO = /\b(reboque|guincho|carro reserva|ve[ií]culo reserva|t[aá]xi|assist[eê]ncia 24)\b/i;

function violacoes(texto) {
  return texto
    .split(/(?<=[.!?])\s+|\n/)
    .filter((f) => SERVICO_NOSSO.test(f))
    .filter((f) => /\b\d{2,4}\s*km\b/i.test(f) || /\b\d{1,2}\s*dias?\b/i.test(f))
    .filter((f) => !PLANO_MENCIONADO.test(f));
}

const CASOS = [
  // deve BARRAR — numero de servico nosso sem dizer o plano
  ['BARRAR', 'Segundo a 21Go, o serviço de guincho 24h cobre até 400km, essencial para emergências.'],
  ['BARRAR', 'A cobertura inclui assistência 24 horas com reboque de 200km.'],
  ['BARRAR', 'Você tem direito a carro reserva por 7 dias após o sinistro.'],
  // deve PASSAR — qualifica o plano
  ['PASSAR', 'No plano Premium o reboque chega a 1.200km.'],
  ['PASSAR', 'O reboque varia conforme o plano — veja a comparação.'],
  // deve PASSAR — nao e beneficio nosso
  ['PASSAR', 'O BYD Dolphin tem autonomia de 400km com uma carga completa.'],
  ['PASSAR', 'A garantia da BYD cobre o motor elétrico e a bateria por 8 anos ou 150.000 km.'],
  ['PASSAR', 'A garantia de fábrica cobre componentes como o motor elétrico por 100.000 km.'],
  ['PASSAR', 'Rodar 300km por dia em aplicativo desgasta mais os pneus.'],
  ['PASSAR', 'Em 2024 o Brasil emplacou mais de 130 mil carros eletrificados.'],
];

let falhas = 0;
for (const [esperado, texto] of CASOS) {
  const obtido = violacoes(texto).length ? 'BARRAR' : 'PASSAR';
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} [${obtido}/esp ${esperado}] ${texto.slice(0, 74)}`);
}

console.log(`\n${CASOS.length - falhas}/${CASOS.length} corretos`);
process.exit(falhas === 0 ? 0 : 1);
