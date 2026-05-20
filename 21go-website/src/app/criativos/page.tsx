'use client'

import { useState } from 'react'

export default function CriativosPage() {
  const [active, setActive] = useState(0)
  const tabs = ['Leilão 80%', 'App 6%', 'SUSEP']

  return (
    <div className="min-h-screen bg-[#111] py-12 px-6">
      <div className="max-w-[600px] mx-auto">
        <h1 className="text-white text-2xl font-bold mb-2">Criativos Meta Ads — 21Go</h1>
        <p className="text-white/50 text-sm mb-8">1080×1080 — Acesse /criativos/export pra gerar PNG</p>

        <div className="flex gap-2 mb-8">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setActive(i)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                active === i ? 'bg-[#F2911D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}>{t}</button>
          ))}
        </div>

        <div className="w-full">
          {active === 0 && <CriativoLeilao />}
          {active === 1 && <CriativoApp />}
          {active === 2 && <CriativoSusep />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CRIATIVO 1 — LEILÃO 80% FIPE
   Gatilho: Você LUCRA com sinistro. Seguradora te daria ZERO.
   ═══════════════════════════════════════════ */
function CriativoLeilao() {
  return (
    <div id="criativo-leilao" className="relative aspect-square w-full overflow-hidden" style={{ background: 'linear-gradient(160deg, #1A2754 0%, #1F3068 50%, #293C82 100%)' }}>
      {/* Arcos laranja decorativos (igual referência) */}
      <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full border-[40px] border-[#F2911D] opacity-60" />
      <div className="absolute -bottom-32 -left-32 w-[350px] h-[350px] rounded-full border-[40px] border-[#F2911D] opacity-40" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-[8%] justify-between">
        {/* Logo */}
        <img src="/logo21go.png" alt="21Go" className="h-12 w-auto self-start" />

        {/* Hook principal */}
        <div>
          <p className="text-[#F2911D] text-[0.8em] font-bold uppercase tracking-widest mb-2">
            Carro de leilão
          </p>
          <p className="text-white text-[2.2em] font-black leading-[1.05] mb-3" style={{ fontFamily: 'var(--font-outfit)' }}>
            Comprou por R$35 mil.<br />
            Se roubarem, recebe<br />
            <span className="text-[#F2911D]">R$48 mil.</span>
          </p>
          <p className="text-white/50 text-[0.85em] leading-snug mb-5">
            A seguradora te daria <span className="text-[#EF4444] font-bold">ZERO</span>. Porque ela<br />
            <span className="text-[#EF4444] font-bold">recusa carro de leilão.</span>
          </p>
        </div>

        {/* Número destaque */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-4">
            <span className="text-[3em] font-black text-[#F2911D] leading-none" style={{ fontFamily: 'var(--font-outfit)' }}>80%</span>
            <div>
              <p className="text-white font-bold text-[0.95em]">da tabela FIPE</p>
              <p className="text-white/50 text-[0.75em]">é o que você recebe em evento de perda total</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#F2911D] text-white text-center py-4 rounded-2xl font-bold text-[1.1em] shadow-lg shadow-[#F2911D]/30">
          Faça sua simulação grátis →
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CRIATIVO 2 — APP 6% COTA
   Gatilho: Seguradora te recusa. 21Go te aceita E cobra menos.
   ═══════════════════════════════════════════ */
function CriativoApp() {
  return (
    <div id="criativo-app" className="relative aspect-square w-full overflow-hidden" style={{ background: 'linear-gradient(160deg, #1A2754 0%, #1F3068 50%, #293C82 100%)' }}>
      {/* Arcos */}
      <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full border-[40px] border-[#F2911D] opacity-60" />
      <div className="absolute -bottom-32 -left-32 w-[350px] h-[350px] rounded-full border-[40px] border-[#F2911D] opacity-40" />

      <div className="relative z-10 flex flex-col h-full p-[8%] justify-between">
        <img src="/logo21go.png" alt="21Go" className="h-12 w-auto self-start" />

        <div>
          <p className="text-[#F2911D] text-[0.8em] font-bold uppercase tracking-widest mb-2">
            Motorista de Uber / 99
          </p>
          <p className="text-white text-[2em] font-black leading-[1.05] mb-4" style={{ fontFamily: 'var(--font-outfit)' }}>
            A seguradora te cobra<br />
            <span className="text-[#EF4444]">+40% ou te recusa.</span><br />
            A 21Go te cobra<br />
            <span className="text-[#F2911D]">6% de cota. Só.</span>
          </p>
        </div>

        {/* Comparativo visual */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl p-4 text-center">
            <p className="text-[#EF4444] text-[0.65em] font-bold uppercase mb-1">Seguradora</p>
            <p className="text-white text-[1.6em] font-black line-through decoration-[#EF4444]" style={{ fontFamily: 'var(--font-outfit)' }}>R$380</p>
            <p className="text-white/40 text-[0.7em]">/mês (quando aceita)</p>
          </div>
          <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl p-4 text-center">
            <p className="text-[#10B981] text-[0.65em] font-bold uppercase mb-1">21Go</p>
            <p className="text-white text-[1.6em] font-black" style={{ fontFamily: 'var(--font-outfit)' }}>R$159</p>
            <p className="text-white/60 text-[0.7em]">/mês — sempre aceita</p>
          </div>
        </div>

        <p className="text-white/40 text-[0.75em] text-center mb-4">
          Economia de <span className="text-white font-bold">R$2.652/ano</span>. E você não fica sem proteção.
        </p>

        <div className="bg-[#F2911D] text-white text-center py-4 rounded-2xl font-bold text-[1.1em] shadow-lg shadow-[#F2911D]/30">
          Faça sua simulação grátis →
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CRIATIVO 3 — SUSEP
   Gatilho: 9 em 10 não são regulamentadas. Se quebrar, você perde TUDO.
   ═══════════════════════════════════════════ */
function CriativoSusep() {
  return (
    <div id="criativo-susep" className="relative aspect-square w-full overflow-hidden" style={{ background: 'linear-gradient(160deg, #1A2754 0%, #1F3068 50%, #293C82 100%)' }}>
      {/* Arcos */}
      <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full border-[40px] border-[#F2911D] opacity-60" />
      <div className="absolute -bottom-32 -left-32 w-[350px] h-[350px] rounded-full border-[40px] border-[#F2911D] opacity-40" />

      <div className="relative z-10 flex flex-col h-full p-[8%] justify-between">
        <img src="/logo21go.png" alt="21Go" className="h-12 w-auto self-start" />

        <div>
          <p className="text-[#F2911D] text-[0.8em] font-bold uppercase tracking-widest mb-2">
            Antes de contratar, pergunte isso
          </p>
          <p className="text-white text-[2em] font-black leading-[1.05] mb-4" style={{ fontFamily: 'var(--font-outfit)' }}>
            9 em 10 "proteções<br />veiculares" <span className="text-[#EF4444]">não são<br />regulamentadas.</span>
          </p>
          <p className="text-white/60 text-[0.9em] leading-snug mb-3">
            Se a empresa fechar, você perde<br />
            <span className="text-white font-bold">todo o dinheiro que pagou.</span>
          </p>
        </div>

        {/* Selo */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#10B981]/15 flex items-center justify-center flex-shrink-0">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-[0.95em] mb-0.5">A 21Go é cadastrada na SUSEP</p>
              <p className="text-white/50 text-[0.75em]">Lei Complementar 213/2025 — Fiscalizada pelo governo federal</p>
            </div>
          </div>
        </div>

        <p className="text-[#F2911D] font-bold text-[0.85em] text-center mb-4">
          ⚠️ Pergunte se é SUSEP. Se não for, saia correndo.
        </p>

        <div className="bg-[#F2911D] text-white text-center py-4 rounded-2xl font-bold text-[1.1em] shadow-lg shadow-[#F2911D]/30">
          Faça sua simulação grátis →
        </div>
      </div>
    </div>
  )
}
