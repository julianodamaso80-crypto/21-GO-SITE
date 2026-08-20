'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao, Cartao, Vazio } from './ui'

type Estado = 'conectado' | 'conectando' | 'desconectado' | 'sem_instancia' | 'indisponivel'

/**
 * Conectar o WhatsApp do consultor por QR, igual ao WhatsApp Web.
 *
 * O QR expira em poucos segundos e a Evolution gera outro sozinha, entao a tela
 * fica perguntando o estado enquanto ele nao le. Sem esse laco, ele leria um
 * codigo ja vencido e acharia que o sistema nao funciona.
 */
export default function MeuWhatsApp() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [aoCliente, setAoCliente] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const consultar = useCallback(async () => {
    const r = await fetch('/api/painel/whatsapp')
    if (r.status === 403 || r.status === 401) return
    const d = await r.json()
    setEstado(d.estado)
    setNumero(d.numero ?? null)
    setAoCliente(Boolean(d.enviarAoCliente))
    if (d.estado === 'conectado') {
      setQr(null)
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  useEffect(() => {
    void consultar()
  }, [consultar])

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), [])

  async function conectar() {
    setErro('')
    setOcupado(true)
    const r = await fetch('/api/painel/whatsapp', { method: 'POST' })
    setOcupado(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra gerar o QR agora.')
      return
    }
    setQr(d.qr)
    setEstado(d.estado)
    // Enquanto o QR está na tela, pergunta de 3 em 3 se ele já leu.
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => void consultar(), 3000)
  }

  async function trocarAoCliente(ligado: boolean) {
    setAoCliente(ligado)
    await fetch('/api/painel/whatsapp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enviarAoCliente: ligado }),
    })
  }

  async function sair() {
    if (!confirm('Desconectar seu WhatsApp? Os avisos voltam a não sair pelo seu número.')) return
    setOcupado(true)
    await fetch('/api/painel/whatsapp', { method: 'DELETE' })
    setOcupado(false)
    setQr(null)
    void consultar()
  }

  if (estado === null) return null
  if (estado === 'indisponivel') return null

  const conectado = estado === 'conectado'

  return (
    <Cartao className={`p-5 ${conectado ? 'border-[#34D399]/40' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: conectado ? '#34D399' : '#FBBF24' }}
          />
          <h2 className="font-bold text-[#E8E8EE]">Meu WhatsApp</h2>
        </div>
        {conectado ? (
          <Botao tipo="ghost" onClick={() => void sair()} disabled={ocupado}>
            Desconectar
          </Botao>
        ) : (
          <Botao tipo="cta" onClick={() => void conectar()} disabled={ocupado}>
            {ocupado ? 'Gerando…' : qr ? 'Gerar outro código' : 'Conectar meu WhatsApp'}
          </Botao>
        )}
      </div>

      {conectado ? (
        <>
          <p className="text-sm text-[#C5C5D2]">
            Conectado{numero ? ` no ${numero}` : ''}. Quem fala com o cliente daqui é o{' '}
            <strong className="text-[#34D399]">seu número</strong>, não o da 21Go.
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#3D3D5C] bg-[#2A2A42]/60 p-3">
            <input
              type="checkbox"
              checked={aoCliente}
              onChange={(e) => void trocarAoCliente(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#E07620]"
            />
            <span className="text-sm text-[#C5C5D2]">
              <strong className="text-[#E8E8EE]">Mandar a cotação direto pro cliente</strong>
              <br />
              Assim que ele simula, o PDF chega no WhatsApp dele — pelo seu número, com o seu nome.
              <br />
              <span className="text-xs text-[#FBBF24]">
                Deixe desligado se preferir chamar você mesmo: disparo automático em série é o que
                faz o WhatsApp derrubar um número.
              </span>
            </span>
          </label>
        </>
      ) : qr ? (
        <div className="flex flex-col items-center gap-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code para conectar o WhatsApp"
            className="h-64 w-64 rounded-lg bg-white p-2"
          />
          <p className="max-w-sm text-center text-sm text-[#C5C5D2]">
            No seu celular: <strong>WhatsApp → Configurações → Aparelhos conectados → Conectar
            aparelho</strong>, e aponte pra este código.
          </p>
          <p className="text-xs text-[#757598]">
            O código muda sozinho a cada poucos segundos. A tela avisa quando conectar.
          </p>
        </div>
      ) : (
        <Vazio>
          Conecte seu WhatsApp e os avisos de lead passam a sair do seu próprio número — com o
          telefone do cliente e o PDF da cotação prontos pra encaminhar.
        </Vazio>
      )}

      {erro && <p className="mt-3 text-sm text-[#FB7185]">{erro}</p>}
    </Cartao>
  )
}
