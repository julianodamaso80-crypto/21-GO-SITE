/**
 * Estilos da pagina de contratacao, num arquivo so.
 *
 * Ficam aqui e nao no `globals.css` porque valem SO pra esta pagina — o resto do
 * site e claro e nao deve carregar nada disto. Todas as classes tem prefixo
 * `qs-` justamente pra nunca vazarem pra outra tela.
 *
 * Paleta obrigatoria da marca (manual v1.0): azul #293C82, laranja #F2911D,
 * verde #C7D301.
 */
export const estilos = `
.qs-palco {
  --azul: #293C82;
  --azul-claro: #4A63B8;
  --laranja: #F2911D;
  --verde: #C7D301;
  --fundo: #060A18;
  --tinta: #EEF2FF;
  --tinta-fraca: #94A0C4;

  position: relative;
  min-height: 100vh;
  background: var(--fundo);
  color: var(--tinta);
  overflow: hidden;
  padding: 7rem 1.5rem 5rem;
  isolation: isolate;
}

/* ─── atmosfera ─────────────────────────────────────────────────────────── */
.qs-halo {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  z-index: -2;
}
.qs-halo1 {
  width: 45rem; height: 45rem;
  top: -18rem; left: -12rem;
  background: radial-gradient(circle, rgba(41,60,130,.75), transparent 68%);
  animation: qs-respira 14s ease-in-out infinite;
}
.qs-halo2 {
  width: 34rem; height: 34rem;
  bottom: -14rem; right: -10rem;
  background: radial-gradient(circle, rgba(242,145,29,.3), transparent 68%);
  animation: qs-respira 18s ease-in-out infinite reverse;
}
@keyframes qs-respira {
  0%,100% { transform: translate3d(0,0,0) scale(1); opacity:.85 }
  50%     { transform: translate3d(2rem,-1.5rem,0) scale(1.12); opacity:1 }
}

.qs-grade {
  position: absolute; inset: 0; z-index: -2; pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 90% 60% at 50% 30%, #000 35%, transparent 100%);
}

/* Granulado: tira o aspecto "gradiente de banco de imagem" do fundo. */
.qs-grao {
  position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .3;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
}

.qs-conteudo { position: relative; max-width: 64rem; margin: 0 auto; }

/* ─── cabecalho ─────────────────────────────────────────────────────────── */
.qs-cabecalho { text-align: center; margin-bottom: 3.5rem; }

.qs-pill {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .4rem .9rem .4rem .6rem;
  border-radius: 999px;
  border: 1px solid rgba(199,211,1,.28);
  background: rgba(199,211,1,.07);
  color: var(--verde);
  font-size: .74rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  animation: qs-sobe .7s cubic-bezier(.2,.7,.3,1) both;
}
.qs-pillPonto {
  width: .45rem; height: .45rem; border-radius: 50%;
  background: var(--verde); box-shadow: 0 0 0 0 rgba(199,211,1,.6);
  animation: qs-farol 2.4s ease-out infinite;
}
@keyframes qs-farol {
  0%   { box-shadow: 0 0 0 0 rgba(199,211,1,.55) }
  70%  { box-shadow: 0 0 0 .55rem rgba(199,211,1,0) }
  100% { box-shadow: 0 0 0 0 rgba(199,211,1,0) }
}

.qs-titulo {
  margin: 1.4rem 0 0;
  font-size: clamp(2.6rem, 7vw, 4.6rem);
  font-weight: 800; line-height: .98; letter-spacing: -.035em;
  animation: qs-sobe .8s cubic-bezier(.2,.7,.3,1) .08s both;
}
.qs-tituloDestaque {
  background: linear-gradient(100deg, var(--laranja) 10%, var(--verde) 90%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.qs-subtitulo {
  max-width: 34rem; margin: 1.5rem auto 0;
  color: var(--tinta-fraca); font-size: 1.05rem; line-height: 1.65;
  animation: qs-sobe .8s cubic-bezier(.2,.7,.3,1) .16s both;
}

@keyframes qs-sobe {
  from { opacity: 0; transform: translateY(1.4rem) }
  to   { opacity: 1; transform: none }
}

/* ─── mockup 3d atras do formulario ─────────────────────────────────────── */
.qs-palcoForm { position: relative; display: flex; justify-content: center; perspective: 1400px; }

.qs-mockup {
  position: absolute; top: -2.5rem; left: 50%;
  width: min(46rem, 92vw);
  transform: translateX(-50%) rotateX(46deg) rotateZ(-14deg) translateZ(-14rem);
  transform-style: preserve-3d;
  opacity: .5; pointer-events: none; z-index: 0;
  animation: qs-flutua 9s ease-in-out infinite;
}
@keyframes qs-flutua {
  0%,100% { transform: translateX(-50%) rotateX(46deg) rotateZ(-14deg) translateZ(-14rem) translateY(0) }
  50%     { transform: translateX(-50%) rotateX(46deg) rotateZ(-14deg) translateZ(-14rem) translateY(-1.6rem) }
}
.qs-janela {
  border-radius: 1rem; overflow: hidden;
  border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(180deg, rgba(26,36,74,.95), rgba(10,16,38,.95));
  box-shadow: 0 3rem 6rem rgba(0,0,0,.6);
}
.qs-barra {
  display: flex; align-items: center; gap: .4rem;
  padding: .7rem .9rem; background: rgba(255,255,255,.05);
  border-bottom: 1px solid rgba(255,255,255,.07);
}
.qs-bolinha { width: .55rem; height: .55rem; border-radius: 50%; background: rgba(255,255,255,.22) }
.qs-url {
  margin-left: .7rem; padding: .25rem .8rem; border-radius: 999px;
  background: rgba(0,0,0,.35); color: var(--tinta-fraca);
  font-family: ui-monospace, monospace; font-size: .72rem;
}
.qs-tela { padding: 1.6rem; display: grid; gap: .8rem }
.qs-telaLinha { height: .85rem; border-radius: 999px; background: rgba(255,255,255,.09) }
.qs-w70 { width: 70% } .qs-w40 { width: 40% } .qs-w55 { width: 55% }
.qs-telaBloco {
  height: 5rem; border-radius: .8rem;
  background: linear-gradient(120deg, rgba(41,60,130,.55), rgba(242,145,29,.22));
}

/* ─── cartao ────────────────────────────────────────────────────────────── */
.qs-cartao {
  position: relative; z-index: 1;
  width: 100%; max-width: 27rem;
  padding: 2.2rem;
  border-radius: 1.5rem;
  /* Borda em gradiente: dois backgrounds, um no padding-box (o vidro) e outro
     no border-box (a borda). E o que da o brilho na quina sem 1px chapado. */
  background:
    linear-gradient(180deg, rgba(20,28,60,.92), rgba(9,14,34,.94)) padding-box,
    linear-gradient(150deg, rgba(242,145,29,.5), rgba(41,60,130,.15) 45%, rgba(199,211,1,.35)) border-box;
  border: 1px solid transparent;
  backdrop-filter: blur(16px);
  box-shadow: 0 2rem 4.5rem rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07);
  animation: qs-sobe .8s cubic-bezier(.2,.7,.3,1) .24s both;
}
.qs-cartaoLargo { max-width: 30rem }

.qs-progresso { display: flex; gap: .35rem; margin-bottom: 1.6rem }
.qs-tick {
  height: .22rem; flex: 1; border-radius: 999px;
  background: rgba(255,255,255,.1);
  transition: background .45s ease, box-shadow .45s ease;
}
.qs-tickOn {
  background: linear-gradient(90deg, var(--laranja), var(--verde));
  box-shadow: 0 0 .9rem rgba(242,145,29,.5);
}

.qs-passo { animation: qs-entra .45s cubic-bezier(.2,.7,.3,1) both }
@keyframes qs-entra {
  from { opacity: 0; transform: translateX(1.2rem) }
  to   { opacity: 1; transform: none }
}

.qs-etiqueta {
  display: block; color: var(--laranja);
  font-size: .72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
}
.qs-h2 {
  margin: .6rem 0 .5rem;
  font-size: 1.55rem; font-weight: 700; line-height: 1.2; letter-spacing: -.02em;
}
.qs-p { color: var(--tinta-fraca); font-size: .92rem; line-height: 1.6; margin: 0 0 1.3rem }
.qs-pDim { color: var(--tinta-fraca); font-size: .85rem; margin: 0 0 .8rem; text-align: center }
.qs-mono { font-family: ui-monospace, monospace; color: var(--verde) }

.qs-input {
  width: 100%; height: 3.4rem; padding: 0 1.1rem;
  border-radius: .85rem;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(0,0,0,.3);
  color: var(--tinta); font-size: 1rem;
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.qs-input::placeholder { color: rgba(148,160,196,.5) }
.qs-input:focus {
  outline: none; border-color: rgba(242,145,29,.65);
  box-shadow: 0 0 0 4px rgba(242,145,29,.14);
  background: rgba(0,0,0,.45);
}

.qs-slugBox {
  display: flex; align-items: center;
  border-radius: .85rem; border: 1px solid rgba(255,255,255,.12);
  background: rgba(0,0,0,.3); overflow: hidden;
  transition: border-color .2s, box-shadow .2s;
}
.qs-slugBox:focus-within {
  border-color: rgba(242,145,29,.65); box-shadow: 0 0 0 4px rgba(242,145,29,.14);
}
.qs-slugPrefixo {
  padding-left: 1rem; color: var(--tinta-fraca);
  font-family: ui-monospace, monospace; font-size: .86rem; white-space: nowrap;
}
.qs-slugInput {
  flex: 1; min-width: 0; height: 3.4rem; padding-right: 1rem;
  border: 0; background: transparent; color: var(--verde);
  font-family: ui-monospace, monospace; font-size: 1rem;
}
.qs-slugInput:focus { outline: none }

.qs-btn {
  width: 100%; height: 3.4rem; margin-top: 1.2rem;
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  border: 0; border-radius: .85rem; cursor: pointer;
  background: linear-gradient(100deg, var(--laranja), #FFB454);
  color: #221200; font-size: .98rem; font-weight: 700;
  box-shadow: 0 .8rem 1.8rem rgba(242,145,29,.32);
  transition: transform .18s cubic-bezier(.2,.7,.3,1), box-shadow .18s, filter .18s;
}
.qs-btn:hover:not(:disabled) {
  transform: translateY(-2px); filter: brightness(1.06);
  box-shadow: 0 1.1rem 2.4rem rgba(242,145,29,.42);
}
.qs-btn:active:not(:disabled) { transform: translateY(0) }
.qs-btn:disabled { opacity: .6; cursor: not-allowed }

.qs-voltar {
  display: block; margin: .9rem auto 0; padding: .3rem;
  border: 0; background: none; cursor: pointer;
  color: var(--tinta-fraca); font-size: .82rem; text-decoration: underline;
  text-underline-offset: 3px;
}
.qs-voltar:hover { color: var(--tinta) }

.qs-spin { animation: qs-gira .9s linear infinite }
@keyframes qs-gira { to { transform: rotate(360deg) } }

/* ─── "achei no power" ──────────────────────────────────────────────────── */
.qs-achei {
  display: flex; gap: .8rem; align-items: center;
  padding: .9rem 1rem; margin-bottom: 1.3rem;
  border-radius: .9rem;
  border: 1px solid rgba(199,211,1,.22);
  background: linear-gradient(120deg, rgba(199,211,1,.09), rgba(199,211,1,.02));
}
.qs-acheiIcone {
  flex-shrink: 0; width: 1.8rem; height: 1.8rem; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--verde); color: #1A2000;
  animation: qs-pop .5s cubic-bezier(.2,1.4,.4,1) both;
}
@keyframes qs-pop { from { transform: scale(0) } to { transform: scale(1) } }
.qs-acheiLabel {
  display: block; color: var(--verde);
  font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
}
.qs-acheiNome { display: block; font-size: .98rem; font-weight: 600; margin-top: .1rem }
.qs-acheiFone {
  display: block; color: var(--tinta-fraca);
  font-family: ui-monospace, monospace; font-size: .8rem;
}

/* ─── checkout ──────────────────────────────────────────────────────────── */
.qs-precoTopo { text-align: center; margin-bottom: 1.5rem }
.qs-precoLabel {
  color: var(--tinta-fraca); font-size: .74rem;
  font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
}
.qs-preco { display: flex; align-items: baseline; justify-content: center; gap: .25rem; margin: .3rem 0 }
.qs-cifra { color: var(--tinta-fraca); font-size: 1.1rem; font-weight: 600 }
.qs-valor {
  font-size: 3.4rem; font-weight: 800; line-height: 1; letter-spacing: -.03em;
  background: linear-gradient(100deg, var(--laranja), var(--verde));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.qs-mes { color: var(--tinta-fraca); font-size: .95rem }
.qs-endereco { font-family: ui-monospace, monospace; font-size: .85rem; color: var(--verde) }

.qs-abas {
  display: flex; gap: .4rem; padding: .3rem; margin-bottom: 1.3rem;
  border-radius: .9rem; background: rgba(0,0,0,.32);
}
.qs-aba {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
  height: 2.6rem; border: 0; border-radius: .7rem; cursor: pointer;
  background: transparent; color: var(--tinta-fraca);
  font-size: .88rem; font-weight: 600;
  transition: background .2s, color .2s;
}
.qs-abaOn { background: rgba(255,255,255,.09); color: var(--tinta) }
.qs-abaDica {
  font-style: normal; font-size: .64rem; font-weight: 700;
  color: var(--verde); text-transform: uppercase; letter-spacing: .05em;
}

.qs-pixBox, .qs-boletoBox { display: flex; flex-direction: column; align-items: center }
.qs-qrMoldura {
  padding: .8rem; border-radius: 1rem; background: #fff; margin-bottom: 1rem;
  box-shadow: 0 1rem 2.5rem rgba(0,0,0,.45);
  animation: qs-pop .45s cubic-bezier(.2,1.3,.4,1) both;
}
.qs-qr { display: block; width: 11rem; height: 11rem }

.qs-linha {
  width: 100%; padding: .9rem; margin-bottom: 1rem;
  border-radius: .7rem; border: 1px solid rgba(255,255,255,.1);
  background: rgba(0,0,0,.32);
  font-family: ui-monospace, monospace; font-size: .78rem;
  word-break: break-all; text-align: center; color: var(--tinta);
}

.qs-btnCopiar {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .7rem 1.3rem; border-radius: .7rem; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06);
  color: var(--tinta); font-size: .88rem; font-weight: 600;
  transition: background .2s, border-color .2s, transform .15s;
}
.qs-btnCopiar:hover { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.28) }
.qs-btnCopiar:active { transform: scale(.97) }
.qs-venc { margin-top: .8rem }

.qs-carregandoBox {
  display: flex; flex-direction: column; align-items: center; gap: .7rem;
  padding: 3rem 0; color: var(--tinta-fraca); font-size: .9rem;
}

.qs-esperando {
  display: flex; align-items: center; justify-content: center; gap: .5rem;
  margin-top: 1.4rem; padding-top: 1.2rem;
  border-top: 1px solid rgba(255,255,255,.07);
  color: var(--tinta-fraca); font-size: .8rem; text-align: center;
}
.qs-pontoPulsa {
  width: .45rem; height: .45rem; border-radius: 50%; flex-shrink: 0;
  background: var(--verde); animation: qs-farol 1.8s ease-out infinite;
}

/* ─── selos e erro ──────────────────────────────────────────────────────── */
.qs-selo {
  width: 3rem; height: 3rem; border-radius: 1rem;
  display: grid; place-items: center; margin-bottom: 1.1rem;
  animation: qs-pop .5s cubic-bezier(.2,1.4,.4,1) both;
}
.qs-seloOk { background: rgba(199,211,1,.14); color: var(--verde); border: 1px solid rgba(199,211,1,.3) }
.qs-seloAlerta { background: rgba(242,145,29,.14); color: var(--laranja); border: 1px solid rgba(242,145,29,.3) }

.qs-nota {
  margin-top: 1.2rem; padding: .9rem 1rem;
  border-radius: .8rem; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
  color: var(--tinta-fraca); font-size: .85rem; line-height: 1.55;
}

.qs-erro {
  display: flex; gap: .5rem; align-items: flex-start;
  margin-top: 1rem; padding: .8rem .9rem;
  border-radius: .7rem;
  border: 1px solid rgba(248,113,113,.3); background: rgba(248,113,113,.1);
  color: #FCA5A5; font-size: .85rem; line-height: 1.5;
}
.qs-erro svg { flex-shrink: 0; margin-top: .1rem }

/* ─── beneficios ────────────────────────────────────────────────────────── */
.qs-beneficios {
  list-style: none; padding: 0;
  margin: 4rem auto 0; max-width: 52rem;
  display: grid; gap: 1px;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.07); border-radius: 1.2rem; overflow: hidden;
}
.qs-beneficio {
  padding: 1.5rem 1.3rem; background: rgba(8,13,32,.75);
  transition: background .3s;
}
.qs-beneficio:hover { background: rgba(20,28,60,.85) }
.qs-beneficioN {
  display: block; color: var(--laranja);
  font-family: ui-monospace, monospace; font-size: .72rem; font-weight: 700;
  margin-bottom: .5rem;
}
.qs-beneficioTitulo { display: block; font-size: .95rem; font-weight: 700; margin-bottom: .25rem }
.qs-beneficioTexto { color: var(--tinta-fraca); font-size: .84rem; line-height: 1.5 }

@media (max-width: 640px) {
  .qs-palco { padding: 5.5rem 1rem 3.5rem }
  .qs-cartao { padding: 1.6rem }
  .qs-mockup { display: none }
}

/* Quem pediu menos movimento recebe a pagina parada, nao quebrada. */
@media (prefers-reduced-motion: reduce) {
  .qs-halo1, .qs-halo2, .qs-mockup, .qs-pillPonto, .qs-pontoPulsa { animation: none }
  .qs-pill, .qs-titulo, .qs-subtitulo, .qs-cartao, .qs-passo, .qs-selo, .qs-qrMoldura, .qs-acheiIcone {
    animation: none; opacity: 1; transform: none;
  }
}
`
