"use client";
import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Smooth scroll SOMENTE no desktop (ponteiro fino, tela >= 1024px) e quando
 * o usuário não pediu movimento reduzido — no celular fica o scroll nativo
 * (regra do redesign: nada de smooth scroll pesado em aparelho fraco).
 *
 * Lenis é sincronizado com o ScrollTrigger (lenis.on('scroll', update) +
 * ticker do GSAP) para as cenas cinematográficas nunca "pularem".
 */
export function initSmoothScroll() {
  const isDesktop =
    window.matchMedia('(min-width: 1024px)').matches &&
    window.matchMedia('(pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isDesktop || reducedMotion) {
    // Scroll nativo: nada a inicializar; devolve um handle inerte.
    return { destroy() {/* noop */} };
  }

  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  const tick = (time: number) => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  return {
    destroy() {
      gsap.ticker.remove(tick);
      lenis.destroy();
    },
  };
}
