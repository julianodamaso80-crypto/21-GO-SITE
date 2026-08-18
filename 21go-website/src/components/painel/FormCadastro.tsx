'use client'
import { useState } from 'react'
import Campo from './Campo'

export default function FormCadastro() {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState<{ nome: string; link: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch('/api/painel/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email, senha }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(d.erro || 'Não deu pra concluir agora.')
        return
      }
      setPronto({ nome: d.nome, link: d.link })
    } catch {
      setErro('Não deu pra concluir agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  /**
   * A senha nao e reenviada por nada: nosso unico chip de WhatsApp e o da casa e
   * ele nao pode falar por site de consultor (chegaria assinado "consultora
   * Leticya"). Entao o link fica na tela, grande, com botao de copiar.
   */
  if (pronto) {
    return (
      <div className="text-center">
        <p className="text-lg font-semibold text-[#293C82] mb-2">Pronto, {pronto.nome}!</p>
        <p className="text-sm text-slate-600 mb-5">
          Este é o seu link. Todo mundo que fizer cotação por ele conta como seu.
        </p>
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm break-all text-slate-800 mb-3">
          {pronto.link}
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(pronto.link)
            setCopiado(true)
          }}
          className="w-full rounded-xl bg-[#C7D301] py-3 font-semibold text-[#293C82] mb-3"
        >
          {copiado ? 'Copiado!' : 'Copiar meu link'}
        </button>
        <a
          href="/app"
          data-sai-do-slug
          className="block w-full rounded-xl bg-[#293C82] py-3 font-semibold text-white"
        >
          Ver meu painel
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="Nome completo" valor={nome} aoMudar={setNome} autoComplete="name" />
      <Campo
        rotulo="WhatsApp"
        valor={whatsapp}
        aoMudar={setWhatsapp}
        dica="Com DDD. Ex: (21) 99220-8062"
        autoComplete="tel"
      />
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" />
      <Campo
        rotulo="Crie uma senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        dica="Mínimo de 8 caracteres"
        autoComplete="new-password"
      />
      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-[#F2911D] py-3 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? 'Criando…' : 'Criar meu acesso'}
      </button>
    </form>
  )
}
