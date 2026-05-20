'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, MessageSquare, ShieldAlert, ChevronDown } from 'lucide-react'

const navLinks = [
  { label: 'Planos', href: '/protecao-veicular' },
  { label: 'Simulação', href: '/cotacao' },
  { label: 'Indique', href: '/indique' },
  { label: 'Seja Consultor', href: '/seja-consultor' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
]

const ouvidoriaLinks = [
  { label: 'Reclamações e Sugestões', href: '/ouvidoria', icon: MessageSquare, desc: 'Nos ajude a melhorar' },
  { label: 'Denúncia Anônima', href: '/denuncia', icon: ShieldAlert, desc: 'Canal 100% sigiloso' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border-b border-[#F0F4FA]'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto max-w-7xl px-6 flex items-center justify-between h-16 lg:h-20">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo21go.png" alt="21Go Proteção Veicular" width={36} height={36} className="rounded-lg" />
          <span className={`font-[var(--font-outfit)] text-xl font-bold tracking-tight transition-colors duration-300 ${
            scrolled ? 'text-[#293C82]' : 'text-white'
          }`}>21Go</span>
        </Link>

        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors duration-300 ${
                scrolled
                  ? 'text-[#64748B] hover:text-[#293C82]'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Ouvidoria Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex items-center gap-1 text-sm font-medium transition-colors duration-300 ${
                scrolled
                  ? 'text-[#64748B] hover:text-[#293C82]'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Ouvidoria
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-72 bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#F0F4FA] overflow-hidden animate-fade-in-up">
                <div className="p-1.5">
                  {ouvidoriaLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-[#F0F4FA] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#293C82]/5 flex items-center justify-center flex-shrink-0 group-hover:bg-[#293C82]/10 transition-colors">
                        <item.icon className="h-4.5 w-4.5 text-[#293C82]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A2754] group-hover:text-[#293C82] transition-colors">{item.label}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:block">
          <Link
            href="/cotacao"
            className="inline-flex items-center px-6 py-2.5 rounded-lg bg-[#F2911D] text-white text-sm font-semibold hover:bg-[#D67A0F] transition-all duration-200 shadow-sm hover:shadow-[0_4px_12px_rgba(242, 145, 29,0.35)] hover:-translate-y-px"
          >
            Cotar Agora
          </Link>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`lg:hidden transition-colors duration-300 ${scrolled ? 'text-[#1A2754]' : 'text-white'}`}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {isOpen && (
        <div className="lg:hidden bg-white border-t border-[#F0F4FA]">
          <div className="px-6 py-6 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="text-base font-medium text-[#64748B] hover:text-[#293C82] py-2"
              >
                {link.label}
              </Link>
            ))}

            {/* Ouvidoria mobile */}
            <div className="border-t border-[#F0F4FA] pt-4 mt-1">
              <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Ouvidoria</p>
              {ouvidoriaLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 py-2.5 text-base font-medium text-[#64748B] hover:text-[#293C82]"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>

            <Link
              href="/cotacao"
              onClick={() => setIsOpen(false)}
              className="mt-2 w-full text-center inline-flex items-center justify-center px-6 py-3 rounded-lg bg-[#F2911D] text-white font-semibold hover:bg-[#D67A0F] transition-colors"
            >
              Simular Agora
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
