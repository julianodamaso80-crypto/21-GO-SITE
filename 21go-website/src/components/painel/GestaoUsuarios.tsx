'use client'
import { useEffect, useState } from 'react'
import { Botao, Campo, Cartao, TituloSecao, Vazio } from './ui'
import CopiarLink from './CopiarLink'

interface Usuario {
  id: string
  nome: string
  email: string
  papel: 'admin' | 'vendedor'
  ativo: boolean
  link: string
  vendedorSlug: string
  ultimoLoginEm: string | null
}

export default function GestaoUsuarios() {
  const [itens, setItens] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [semPermissao, setSemPermissao] = useState(false)
  const [abrirForm, setAbrirForm] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [novoAcesso, setNovoAcesso] = useState<{
    titulo: string
    email?: string
    senha: string
    link?: string
  } | null>(null)
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
    setNovoAcesso({
      titulo: `Acesso criado para ${d.usuario.nome}`,
      email: d.usuario.email,
      senha: d.senha,
      link: d.usuario.link,
    })
    setNome('')
    setEmail('')
    setWhatsapp('')
    setAbrirForm(false)
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
    if (d.senha) setNovoAcesso({ titulo: 'Senha nova gerada', senha: d.senha })
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
    return <p className="text-sm text-[#9D9DB5]">Só o dono do painel vê esta página.</p>

  const equipe = itens.filter((u) => u.papel !== 'admin')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#E8E8EE]">Quem me indica</h1>
          <p className="mt-1 text-sm text-[#9D9DB5]">
            Cada pessoa recebe um link próprio. Todo lead que entrar por ele fica no nome dela.
          </p>
        </div>
        <Botao tipo="cta" onClick={() => setAbrirForm((v) => !v)}>
          {abrirForm ? 'Fechar' : '+ Cadastrar indicador'}
        </Botao>
      </div>

      {/* A senha so existe aqui, uma vez. Nada e reenviado por WhatsApp: nosso
          unico chip e o da casa e ele nao pode falar por site de consultor. */}
      {novoAcesso && (
        <Cartao className="border-[#34D399]/40 bg-gradient-to-br from-[#34D399]/10 to-[#1A1F35] p-5">
          <p className="font-bold text-[#E8E8EE]">{novoAcesso.titulo}</p>
          <div className="mt-3 space-y-1.5 text-sm">
            {novoAcesso.email && (
              <p className="text-[#C5C5D2]">
                Login: <span className="font-mono text-[#E8E8EE]">{novoAcesso.email}</span>
              </p>
            )}
            <p className="text-[#C5C5D2]">
              Senha:{' '}
              <span className="rounded bg-[#2A2A42] px-2 py-0.5 font-mono font-bold text-[#34D399]">
                {novoAcesso.senha}
              </span>
            </p>
            {novoAcesso.link && (
              <p className="break-all text-[#C5C5D2]">
                Link: <span className="font-mono text-[#E8E8EE]">{novoAcesso.link}</span>
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-[#FBBF24]">
            Anote e passe pra pessoa agora — esta senha não aparece de novo.
          </p>
          <Botao tipo="ghost" className="mt-3" onClick={() => setNovoAcesso(null)}>
            Ok, anotei
          </Botao>
        </Cartao>
      )}

      {abrirForm && (
        <Cartao className="p-5">
          <form onSubmit={criar}>
            <TituloSecao>Cadastrar quem vai me indicar</TituloSecao>
            <div className="grid gap-x-4 md:grid-cols-3">
              <Campo rotulo="Nome completo" valor={nome} aoMudar={setNome} />
              <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
              <Campo rotulo="WhatsApp" valor={whatsapp} aoMudar={setWhatsapp} dica="Com DDD" />
            </div>
            {erro && <p className="mb-3 text-sm text-[#FB7185]">{erro}</p>}
            <Botao tipo="cta">Criar acesso e gerar link</Botao>
          </form>
        </Cartao>
      )}

      {editando && (
        <Cartao className="border-[#6B96EB]/40 p-5">
          <form onSubmit={salvarEdicao}>
            <TituloSecao>Editar acesso</TituloSecao>
            <div className="grid gap-x-4 md:grid-cols-2">
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
            </div>
            <p className="mb-3 text-xs text-[#757598]">
              O link de divulgação não muda — ele já foi espalhado por aí.
            </p>
            {erro && <p className="mb-3 text-sm text-[#FB7185]">{erro}</p>}
            <div className="flex gap-2">
              <Botao tipo="primario">Salvar</Botao>
              <Botao
                type="button"
                tipo="ghost"
                onClick={() => {
                  setEditando(null)
                  setErro('')
                }}
              >
                Cancelar
              </Botao>
            </div>
          </form>
        </Cartao>
      )}

      {equipe.length === 0 ? (
        <Vazio>
          Ninguém cadastrado ainda. Clique em <strong>Cadastrar indicador</strong> e a pessoa já sai
          daqui com login e link próprio.
        </Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {equipe.map((u) => (
            <Cartao key={u.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-[#E8E8EE]">{u.nome}</p>
                  <p className="truncate text-xs text-[#9D9DB5]">{u.email}</p>
                </div>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={
                    u.ativo
                      ? { color: '#34D399', background: 'rgba(52,211,153,.12)' }
                      : { color: '#9D9DB5', background: 'rgba(157,157,181,.12)' }
                  }
                >
                  {u.ativo ? 'ativo' : 'desativado'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-[#9D9DB5]">
                  {u.link.replace('https://', '')}
                </p>
                <CopiarLink link={u.link} compacto />
              </div>

              <p className="mt-2 text-[11px] text-[#757598]">
                {u.ultimoLoginEm
                  ? `último acesso em ${new Date(u.ultimoLoginEm).toLocaleDateString('pt-BR')}`
                  : 'ainda não entrou no painel'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setEditando({ id: u.id, nome: u.nome, email: u.email })}
                  className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-xs font-semibold text-[#C5C5D2] hover:bg-[#2A2A42]"
                >
                  Editar
                </button>
                <button
                  onClick={() => void acao(u.id, { acao: 'senha' })}
                  className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-xs font-semibold text-[#C5C5D2] hover:bg-[#2A2A42]"
                >
                  Nova senha
                </button>
                <button
                  onClick={() => void acao(u.id, { acao: u.ativo ? 'desativar' : 'ativar' })}
                  className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-xs font-semibold text-[#C5C5D2] hover:bg-[#2A2A42]"
                >
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button
                  onClick={() => void excluir(u.id, u.nome)}
                  className="rounded-lg border border-[#FB7185]/30 bg-[#FB7185]/10 px-3 py-1.5 text-xs font-semibold text-[#FB7185] hover:bg-[#FB7185]/20"
                >
                  Excluir
                </button>
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </div>
  )
}
