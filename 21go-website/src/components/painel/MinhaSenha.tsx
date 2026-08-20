'use client'
import { useState } from 'react'
import { Botao, Campo, Cartao, TituloSecao } from './ui'

/** Trocar a propria senha, sem depender de ninguem. */
export default function MinhaSenha() {
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function trocar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const r = await fetch('/api/painel/minha-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atual, nova }),
    })
    setSalvando(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra trocar.')
      return
    }
    setAtual('')
    setNova('')
    setPronto(true)
    setAberto(false)
  }

  if (!aberto)
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setAberto(true)
            setPronto(false)
          }}
          className="text-xs font-semibold text-[#6B96EB] hover:underline"
        >
          trocar minha senha
        </button>
        {pronto && <span className="text-xs text-[#34D399]">senha trocada ✓</span>}
      </div>
    )

  return (
    <Cartao className="p-5">
      <form onSubmit={trocar}>
        <TituloSecao>Trocar minha senha</TituloSecao>
        <div className="grid gap-x-4 md:grid-cols-2">
          <Campo
            rotulo="Senha atual"
            tipo="password"
            valor={atual}
            aoMudar={setAtual}
            autoComplete="current-password"
          />
          <Campo
            rotulo="Nova senha"
            tipo="password"
            valor={nova}
            aoMudar={setNova}
            dica="Mínimo de 8 caracteres"
            autoComplete="new-password"
          />
        </div>
        {erro && <p className="mb-3 text-sm text-[#FB7185]">{erro}</p>}
        <div className="flex gap-2">
          <Botao tipo="primario" disabled={salvando}>
            {salvando ? 'Trocando…' : 'Trocar senha'}
          </Botao>
          <Botao type="button" tipo="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        </div>
        <p className="mt-3 text-xs text-[#757598]">
          Trocar a senha desconecta seus outros aparelhos.
        </p>
      </form>
    </Cartao>
  )
}
