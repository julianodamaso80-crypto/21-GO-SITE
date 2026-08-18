'use client'
import { useState } from 'react'
import Campo from './Campo'

export default function FormLogin() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch('/api/painel/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(
          d.erro === 'muitas_tentativas'
            ? 'Muitas tentativas. Espere 15 minutos.'
            : 'E-mail ou senha incorretos.',
        )
        return
      }
      window.location.href = '/app'
    } catch {
      setErro('Não deu pra entrar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" />
      <Campo
        rotulo="Senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="current-password"
      />
      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-[#F2911D] py-3 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
