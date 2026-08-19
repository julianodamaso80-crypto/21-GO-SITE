'use client'
import { useEffect, useState } from 'react'
import Campo from './Campo'

interface Usuario {
  id: string
  nome: string
  email: string
  papel: 'admin' | 'vendedor'
  ativo: boolean
  link: string
  ultimoLoginEm: string | null
}

export default function GestaoUsuarios() {
  const [itens, setItens] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [semPermissao, setSemPermissao] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [novoAcesso, setNovoAcesso] = useState<{ nome: string; senha: string; link: string } | null>(
    null,
  )
  // Quem esta sendo editado agora. O link NAO entra aqui: ele ja foi impresso e
  // postado por ai, entao so nome, e-mail e WhatsApp mudam.
  const [editando, setEditando] = useState<{ id: string; nome: string; email: string } | null>(null)

  async function carregar() {
    const r = await fetch('/api/painel/usuarios')
    if (r.status === 401) {
      window.location.href = '/'
      return
    }
    if (r.status === 403) {
      setSemPermissao(true)
      return
    }
    const d = await r.json()
    setItens(d.itens ?? [])
  }

  useEffect(() => {
    void carregar()
  }, [])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const r = await fetch('/api/painel/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, whatsapp }),
    })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra criar.')
      return
    }
    setNovoAcesso({ nome: d.usuario.nome, senha: d.senha, link: d.usuario.link })
    setNome('')
    setEmail('')
    setWhatsapp('')
    void carregar()
  }

  async function acao(id: string, corpo: Record<string, unknown>) {
    const r = await fetch(`/api/painel/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra concluir.')
      return
    }
    if (d.senha) setNovoAcesso({ nome: 'Senha nova', senha: d.senha, link: '' })
    void carregar()
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro('')
    const r = await fetch(`/api/painel/usuarios/${editando.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: editando.nome, email: editando.email }),
    })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra salvar.')
      return
    }
    setEditando(null)
    void carregar()
  }

  async function excluir(id: string, nomeDele: string) {
    if (!confirm(`Excluir o acesso de ${nomeDele}? Os leads que ele trouxe continuam no histórico.`))
      return
    const r = await fetch(`/api/painel/usuarios/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      setErro(d.erro || 'Não deu pra excluir.')
      return
    }
    void carregar()
  }

  if (semPermissao)
    return <p className="text-sm text-slate-600">Só o dono do painel vê esta página.</p>

  return (
    <div className="space-y-6">
      {novoAcesso && (
        <div className="rounded-2xl border border-[#C7D301] bg-[#C7D301]/10 p-4">
          <p className="font-semibold text-[#293C82]">{novoAcesso.nome}</p>
          <p className="mt-1 text-sm text-slate-700">
            Senha: <span className="font-mono font-bold">{novoAcesso.senha}</span>
          </p>
          {novoAcesso.link && (
            <p className="mt-1 break-all text-sm text-slate-700">Link: {novoAcesso.link}</p>
          )}
          <p className="mt-2 text-xs text-slate-600">Anote agora — esta senha não aparece de novo.</p>
          <button onClick={() => setNovoAcesso(null)} className="mt-2 text-sm underline">
            Ok, anotei
          </button>
        </div>
      )}

      {editando && (
        <form onSubmit={salvarEdicao} className="rounded-2xl border border-[#293C82] bg-white p-4">
          <h2 className="mb-3 font-semibold text-[#293C82]">Editar acesso</h2>
          <Campo
            rotulo="Nome"
            valor={editando.nome}
            aoMudar={(v) => setEditando({ ...editando, nome: v })}
          />
          <Campo
            rotulo="E-mail"
            tipo="email"
            valor={editando.email}
            aoMudar={(v) => setEditando({ ...editando, email: v })}
          />
          <p className="mb-3 text-xs text-slate-500">
            O link de divulgação não muda — ele já foi espalhado por aí.
          </p>
          {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button className="rounded-xl bg-[#293C82] px-4 py-2.5 font-semibold text-white">
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(null)
                setErro('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-2.5 font-medium text-slate-600"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <form onSubmit={criar} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-[#293C82]">Dar acesso a alguém</h2>
        <Campo rotulo="Nome completo" valor={nome} aoMudar={setNome} />
        <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
        <Campo rotulo="WhatsApp" valor={whatsapp} aoMudar={setWhatsapp} dica="Com DDD" />
        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
        <button className="rounded-xl bg-[#F2911D] px-4 py-2.5 font-semibold text-white">
          Criar acesso
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3 font-medium">Pessoa</th>
              <th className="p-3 font-medium">Link</th>
              <th className="p-3 font-medium">Situação</th>
              <th className="p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-3">
                  <span className="font-medium text-slate-800">{u.nome}</span>
                  <br />
                  <span className="text-xs text-slate-500">{u.email}</span>
                </td>
                <td className="p-3 break-all text-xs text-slate-600">{u.link}</td>
                <td className="p-3">
                  {u.papel === 'admin' ? 'Dono' : u.ativo ? 'Ativo' : 'Desativado'}
                </td>
                <td className="p-3">
                  {u.papel !== 'admin' && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() =>
                          setEditando({ id: u.id, nome: u.nome, email: u.email })
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => void acao(u.id, { acao: 'senha' })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        Nova senha
                      </button>
                      <button
                        onClick={() => void acao(u.id, { acao: u.ativo ? 'desativar' : 'ativar' })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        onClick={() => void excluir(u.id, u.nome)}
                        className="rounded-lg border border-red-300 px-2 py-1 text-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
