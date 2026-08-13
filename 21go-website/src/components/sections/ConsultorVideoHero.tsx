'use client'

/**
 * HERO do site de um consultor que mandou vídeo próprio (ver
 * `consultores-video.ts`).
 *
 * Substitui o hero do presidente: o vídeo dele TOMA a primeira dobra inteira,
 * de borda a borda, com a headline curta e o botão de simulação por cima, na
 * base. Fora do hero, a home segue idêntica à da 21Go.
 *
 * ─── Som ligado por padrão, sem quebrar quando o navegador não deixa ────────
 *
 * O vídeo é depoimento falado, então nasce COM som (decisão do dono). Só que
 * autoplay com áudio é bloqueado por todo navegador enquanto o visitante não
 * interagiu com a página: nesse caso `play()` rejeita e o vídeo ficaria PARADO,
 * que é pior que mudo.
 *
 * Então a ordem é: tenta com som; se o navegador recusar, toca mudo E fica
 * esperando o PRIMEIRO gesto do visitante em qualquer lugar da página (toque,
 * clique, tecla) pra ligar o áudio do começo — ninguém precisa achar o botão. Na
 * prática o som entra no primeiro toque, que é o mais perto de "já começa
 * ligado" que o navegador permite. O botão em cima do vídeo continua ali pra
 * quem quiser DESLIGAR.
 */

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Volume2, VolumeX } from 'lucide-react'
import Link from '@/components/Link'
import { BotaoFaleWhatsApp } from '@/components/ui/BotaoFaleWhatsApp'
import type { VideoConsultor } from '@/lib/consultores-video'

/**
 * Este script vai INLINE no HTML, antes de qualquer JavaScript do site carregar,
 * e é o ÚNICO dono do áudio do vídeo.
 *
 * Por que inline: o navegador só libera som depois de uma interação do
 * visitante, e a primeira interação costuma acontecer no primeiro segundo —
 * antes do React hidratar. Um "escutador" que só existisse no efeito do React
 * perderia esse primeiro toque e o vídeo seguiria mudo até a pessoa tocar de
 * novo.
 *
 * Por que ÚNICO: com o React tentando `play()` em paralelo, a segunda chamada
 * era abortada pelo navegador ("play() request was interrupted"), o `catch`
 * dela remutava o vídeo e o som que já tinha entrado sumia. Uma ponta só.
 */
const SCRIPT_LIGA_SOM = `(function(){
  var EVS=['pointerdown','pointerup','click','touchstart','touchend','touchmove','keydown','mousemove','wheel','scroll'];
  var indo=false;
  function limpa(){for(var i=0;i<EVS.length;i++)window.removeEventListener(EVS[i],tenta,true)}
  function tenta(){
    var v=document.querySelector('[data-video-consultor]');
    if(!v)return;
    if(v.dataset.somDesligado==='1'){limpa();return}
    if(indo)return;
    indo=true;
    var onde=v.currentTime;
    v.muted=false;
    var p=v.play();
    if(p&&p.then){p.then(function(){indo=false;v.currentTime=0;limpa()}).catch(function(){indo=false;v.muted=true;v.currentTime=onde;v.play().catch(function(){})})}
    else{indo=false}
  }
  tenta();
  for(var i=0;i<EVS.length;i++)window.addEventListener(EVS[i],tenta,{passive:true,capture:true});
})()`

export function ConsultorVideoHero({ video }: { video: VideoConsultor }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [comSom, setComSom] = useState(true)
  const botaoRef = useRef<HTMLButtonElement>(null)

  /* O rótulo do botão segue o estado real do vídeo — inclusive quando quem
     ligou o som foi o script inline, antes do React existir. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const sincronizar = () => setComSom(!el.muted)
    sincronizar()
    el.addEventListener('volumechange', sincronizar)
    return () => el.removeEventListener('volumechange', sincronizar)
  }, [])

  /* Pausa fora da tela e em aba oculta — com áudio ligado, vídeo tocando onde
     ninguém vê é barulho no meio da navegação. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          // `paused` na guarda: um `play()` a mais aqui abortaria o `play()` que
          // o script do som pode estar fazendo no mesmo instante.
          if (e.isIntersecting) {
            if (el.paused) el.play().catch(() => {})
          } else el.pause()
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    const onVis = () => {
      if (document.hidden) el.pause()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  function alternarSom() {
    const el = videoRef.current
    if (!el) return
    const ligando = el.muted
    el.muted = !ligando
    // O script inline lê isto pra não religar o som de quem pediu silêncio.
    el.dataset.somDesligado = ligando ? '0' : '1'
    el.play().catch(() => {})
    setComSom(ligando)
  }

  return (
    /* Tela cheia: o vídeo É a primeira dobra. Sem moldura e sem fundo azul em
       volta — o que sobra de azul seria justamente o que tira o vídeo do lugar
       de destaque. */
    <section className="relative h-[100svh] w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        data-video-consultor="true"
        /* `object-cover` preenche a tela nos dois formatos. No desktop (deitado)
           o recorte sobe um pouco pra manter os rostos no quadro, em vez de
           centralizar no chão. */
        className="absolute inset-0 h-full w-full object-cover object-[center_38%] lg:object-[center_42%]"
        poster={video.poster}
        loop
        autoPlay
        playsInline
        preload="metadata"
        controls={false}
      >
        <source src={video.mp4} type="video/mp4" />
      </video>

      {/* Depois do <video>: o script busca o elemento assim que roda. */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_LIGA_SOM }} />

      {/* Escurecimento só onde entra texto: topo leve (logo do header) e base
          forte (headline e botões). O meio do vídeo fica limpo. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to bottom, rgba(6,10,26,0.55) 0%, rgba(6,10,26,0.12) 18%, rgba(6,10,26,0) 34%, rgba(6,10,26,0.35) 56%, rgba(6,10,26,0.82) 78%, rgba(6,10,26,0.95) 100%)',
        }}
      />

      {/* Desligar o som — canto de cima, longe dos CTAs e fora do caminho do
          dedo que rola a página. No celular fica ABAIXO da faixa dos 80px: é
          onde o aviso "carregando cenas" do ScrollCinema passa nos primeiros
          segundos, e ele cobriria justamente este botão. */}
      <button
        ref={botaoRef}
        type="button"
        onClick={alternarSom}
        aria-label={comSom ? 'Desligar o som do vídeo' : 'Ligar o som do vídeo'}
        className="absolute right-4 top-[8.25rem] z-20 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/55 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80 sm:text-sm lg:top-28"
      >
        {comSom ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {comSom ? 'Desligar som' : 'Ativar som'}
      </button>

      {/* Texto e CTAs sobre o vídeo, na base */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-[6.5rem] text-center sm:px-6 lg:pb-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-[var(--font-outfit)] text-[clamp(1.25rem,min(6vw,3.2vh),1.9rem)] font-bold leading-[1.14] tracking-tight text-white [text-shadow:0_2px_20px_rgba(4,8,24,0.85)] sm:text-3xl md:text-4xl lg:text-5xl">
            {video.titulo} <span className="text-gradient-orange">{video.destaque}</span>
          </h1>

          <p className="mt-[1vh] text-[clamp(0.8rem,1.8vh,0.95rem)] font-medium text-white/90 [text-shadow:0_1px_12px_rgba(4,8,24,0.9)] sm:mt-3 sm:text-lg">
            {video.subtitulo}
          </p>

          <div
            data-cta-section="hero"
            className="mt-[1.8vh] flex w-full flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-4"
          >
            <Link
              href="/cotacao"
              className="shimmer-btn relative inline-flex w-full max-w-[320px] animate-glow-pulse items-center justify-center rounded-xl bg-[#F2911D] px-6 py-[clamp(0.7rem,1.7vh,0.95rem)] text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D67A0F] hover:shadow-[0_8px_30px_rgba(242,145,29,0.5)] sm:w-auto sm:max-w-none sm:px-9 sm:py-4 sm:text-base"
            >
              Fazer Simulação Grátis
            </Link>
            <BotaoFaleWhatsApp
              origin="hero"
              className="inline-flex w-full max-w-[320px] items-center justify-center gap-2.5 rounded-xl border border-white/25 bg-white/[0.12] px-6 py-[clamp(0.7rem,1.7vh,0.95rem)] text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/20 sm:w-auto sm:max-w-none sm:px-7 sm:py-4 sm:text-base"
            >
              <MessageCircle className="h-4 w-4 text-[#25D366] sm:h-5 sm:w-5" />
              Fale no WhatsApp
            </BotaoFaleWhatsApp>
          </div>
        </div>
      </div>
    </section>
  )
}
