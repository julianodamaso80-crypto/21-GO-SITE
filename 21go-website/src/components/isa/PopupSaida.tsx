'use client'

import { useEffect, useRef, useState } from 'react'
import { Gift, X } from 'lucide-react'
import { podeMostrarPopup, linkDoPopup } from '@/lib/isa/popup.regras'

/**
 * Popup de saida da tela de planos (Isa, fase 6). Regras em popup.regras.ts.
 *
 * Desktop: o mouse sai pelo topo da janela. Celular: 45 s parado na tela de planos.
 * Nao fala valor — o desconto e a Isa que da, do outro lado. `?isa=teste` liga o popup mesmo com
 * a chave do servidor desligada, pra o dono testar em producao; o "uma vez por simulacao" e as
 * travas de dominio e de consultor continuam valendo.
 */

const PARADO_NO_CELULAR_MS = 45_000

interface Props {
  /** Tela de planos visivel, com plano escolhido. */
  ativo: boolean
  /** Identifica a simulacao pro "uma vez so" (leadId, ou o veiculo enquanto o lead nao salvou). */
  chave: string
  temConsultor: boolean
  /** Primeiro nome do formulario, pro "Espera, Fulano!". */
  nome: string
  jaClicou: () => boolean
  mensagem: () => string
  onAbrir: () => void
}

function veioDeConsultor(): boolean {
  if (/(?:^|;\s*)c21go_dono=/.test(document.cookie)) return true
  // O HTML e o mesmo em /cotacao e /<slug>/cotacao: so a URL de verdade diz de quem e a visita.
  return window.location.pathname.replace(/\/+$/, '') !== '/cotacao'
}

function jaViu(chave: string): boolean {
  try { return localStorage.getItem(`isa_popup:${chave}`) === '1' } catch { return false }
}

function marcarVisto(chave: string): void {
  try { localStorage.setItem(`isa_popup:${chave}`, '1') } catch {}
}

export default function PopupSaida({ ativo, chave, temConsultor, nome, jaClicou, mensagem, onAbrir }: Props) {
  const [ligado, setLigado] = useState(false)
  const [aberto, setAberto] = useState(false)
  // A pagina recria estas funcoes a cada render; em ref, o relogio dos 45 s nao reinicia a toa.
  const jaClicouRef = useRef(jaClicou)
  jaClicouRef.current = jaClicou

  // A chave vem do servidor (ISA_POPUP), a cada visita.
  useEffect(() => {
    if (!ativo) return
    if (new URLSearchParams(window.location.search).get('isa') === 'teste') { setLigado(true); return }
    let vivo = true
    fetch('/api/isa/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { popup: false }))
      .then((d: { popup?: boolean }) => { if (vivo) setLigado(d.popup === true) })
      .catch(() => {})
    return () => { vivo = false }
  }, [ativo])

  useEffect(() => {
    if (!ativo || !ligado || aberto) return
    const pode = () => podeMostrarPopup({
      ligado,
      hostname: window.location.hostname,
      temConsultor: temConsultor || veioDeConsultor(),
      clicouContratar: jaClicouRef.current(),
      jaViu: jaViu(chave),
      temPlanos: ativo,
    })
    if (!pode()) return

    const mostrar = () => {
      if (!pode()) return
      marcarVisto(chave)
      setAberto(true)
    }

    const celular = window.matchMedia('(pointer: coarse)').matches
    if (celular) {
      let t = setTimeout(mostrar, PARADO_NO_CELULAR_MS)
      const mexeu = () => { clearTimeout(t); t = setTimeout(mostrar, PARADO_NO_CELULAR_MS) }
      const eventos = ['touchstart', 'scroll', 'keydown'] as const
      eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true }))
      return () => {
        clearTimeout(t)
        eventos.forEach((e) => window.removeEventListener(e, mexeu))
      }
    }

    const saiu = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) mostrar()
    }
    document.addEventListener('mouseout', saiu)
    return () => document.removeEventListener('mouseout', saiu)
  }, [ativo, ligado, aberto, chave, temConsultor])

  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto])

  if (!aberto) return null
  const p = nome.trim().split(/\s+/)[0] || ''
  const primeiro = p.length >= 2 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-[#0F1A3D]/60 backdrop-blur-[2px] p-4"
      onClick={() => setAberto(false)}
      data-isa-popup
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="isa-popup-titulo"
        className="relative w-full max-w-sm rounded-3xl bg-white shadow-[0_24px_60px_-12px_rgba(15,26,61,0.45)] overflow-hidden animate-[isaSobe_.28s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes isaSobe{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
        <div className="h-1.5 flex">
          <span className="flex-[60] bg-[#293C82]" />
          <span className="flex-[25] bg-[#F2911D]" />
          <span className="flex-[15] bg-[#C7D301]" />
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="absolute right-3 top-4 p-2 rounded-full text-[#94A3B8] hover:text-[#1A2754] hover:bg-[#F1F4FB] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="px-7 pt-7 pb-6 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#FFF4E6] flex items-center justify-center">
            <Gift className="w-7 h-7 text-[#F2911D]" />
          </div>
          <h2 id="isa-popup-titulo" className="text-[22px] leading-tight font-extrabold text-[#1A2754]">
            {primeiro ? `Espera, ${primeiro}! 👋` : 'Espera! 👋'}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#475569]">
            Fale com um dos nossos consultores e <strong className="text-[#293C82]">ganhe um desconto na sua ativação</strong>.
          </p>
          <a
            href={linkDoPopup(mensagem())}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { onAbrir(); setAberto(false) }}
            data-track-origin="cotacao_popup_saida"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F2911D] px-5 py-4 text-[16px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(242,145,29,0.6)] hover:bg-[#E07F0B] active:scale-[0.99] transition"
          >
            Quero meu desconto
          </a>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="mt-3 w-full py-2 text-[13px] font-semibold text-[#94A3B8] hover:text-[#475569]"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
