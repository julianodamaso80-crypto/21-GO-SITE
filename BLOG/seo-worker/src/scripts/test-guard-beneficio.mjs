const PLANO_MENCIONADO = /\b(b[aá]sico|jeito|vip|premium|conforme o plano|varia (conforme|por|de acordo com) o plano|depende do plano|cada plano)\b/i;
const CONTEXTO_BENEFICIO = /\b(reboque|guincho|carro reserva|t[aá]xi|assist[eê]ncia|cobre|cobertura|inclu[ií]|oferece)\b/i;
function checa(texto){
  const frases = texto.split(/(?<=[.!?])\s+|\n/)
    .filter(f=>CONTEXTO_BENEFICIO.test(f))
    .filter(f=>/\b\d{2,4}\s*km\b/i.test(f) || /\b\d{1,2}\s*dias?\b/i.test(f));
  return frases.filter(f=>!PLANO_MENCIONADO.test(f));
}
const casos = [
  ['BARRAR',  'Segundo a 21Go, o serviço de guincho 24h cobre até 400km, essencial para emergências.'],
  ['BARRAR',  'A 21Go oferece carro reserva por 7 dias em caso de sinistro.'],
  ['PASSAR',  'O BYD Dolphin tem autonomia de 400km com uma carga completa.'],
  ['PASSAR',  'A bateria dura cerca de 8 anos segundo o fabricante.'],
  ['PASSAR',  'No plano Premium o reboque chega a 1.200km.'],
  ['PASSAR',  'O reboque varia conforme o plano — veja a comparação.'],
  ['PASSAR',  'Em 2024 o Brasil emplacou mais de 130 mil carros eletrificados.'],
  ['PASSAR',  'Rodar 300km por dia em aplicativo desgasta mais os pneus.'],
  ['BARRAR',  'A cobertura inclui assistência com reboque de 200km.'],
];
let falhas=0;
for (const [esperado, texto] of casos){
  const hits = checa(texto);
  const obtido = hits.length ? 'BARRAR' : 'PASSAR';
  const ok = obtido === esperado;
  if(!ok) falhas++;
  console.log(`${ok?'OK   ':'FALHA'} [${obtido}/esp ${esperado}] ${texto.slice(0,72)}`);
}
console.log(`\n${casos.length-falhas}/${casos.length} corretos`);
process.exit(falhas?1:0);
