'use client'
import { useState } from 'react'
import { Botao, Campo } from './ui'

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
        <p className="mb-2 text-lg font-bold text-[#E8E8EE]">Pronto, {pronto.nome}!</p>
        <p className="mb-5 text-sm text-[#9D9DB5]">
          Este é o seu link. Todo mundo que fizer cotação por ele conta como seu.
        </p>
        <div className="mb-3 break-all rounded-lg border border-[#3D3D5C] bg-[#2A2A42] px-4 py-3 font-mono text-sm text-[#E8E8EE]">
          {pronto.link}
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(pronto.link)
            setCopiado(true)
          }}
          className="mb-3 w-full rounded-lg bg-[#E07620] py-3 font-semibold text-white transition-colors hover:bg-[#C4651A]"
        >
          {copiado ? 'Copiado!' : 'Copiar meu link'}
        </button>
        <a
          href="/app"
          data-sai-do-slug
          className="block w-full rounded-lg bg-[#1B4DA1] py-3 font-semibold text-white transition-colors hover:bg-[#164087]"
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
      {erro && <p className="mb-4 text-sm text-[#FB7185]">{erro}</p>}
      <Botao tipo="cta" type="submit" disabled={enviando} className="w-full">
        {enviando ? 'Criando…' : 'Criar meu acesso'}
      </Botao>
    </form>
  )
}
