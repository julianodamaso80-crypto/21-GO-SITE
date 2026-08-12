import type { Metadata } from 'next'
import { FormularioSite } from './FormularioSite'
import { estilos } from './estilos'

/**
 * A pagina de venda do site do consultor. Substitui o `crm21go.site/quero-site`,
 * que so juntava pedido pra alguem ligar depois — aqui a venda se fecha sozinha.
 *
 * ─── Por que o fundo e escuro ───────────────────────────────────────────────
 *
 * Alem do peso visual, resolve um bug real: o Header do site e transparente com
 * texto BRANCO ate o primeiro scroll. Sobre o fundo claro da versao anterior,
 * "Planos", "Simulacao" e o resto do menu ficavam ilegiveis. Com o hero escuro,
 * o header volta a funcionar como foi desenhado.
 */

export const metadata: Metadata = {
  title: 'Seu site da 21Go',
  description:
    'Tenha um site da 21Go no seu nome, com seus leads caindo direto no seu Power. R$ 80 por mês.',
  // Pagina de venda pra consultor, nao pra cliente final: nao disputa busca com
  // o site principal nem com os sites dos consultores.
  robots: { index: false, follow: false },
}

export default function QueroSitePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: estilos }} />

      <div className="qs-palco">
        {/* Atmosfera: dois halos que respiram, malha de grade e granulado por
            cima. E o que separa "fundo azul" de "profundidade". */}
        <div className="qs-halo qs-halo1" aria-hidden />
        <div className="qs-halo qs-halo2" aria-hidden />
        <div className="qs-grade" aria-hidden />
        <div className="qs-grao" aria-hidden />

        <div className="qs-conteudo">
          <header className="qs-cabecalho">
            <span className="qs-pill">
              <span className="qs-pillPonto" />
              Exclusivo para consultores 21Go
            </span>

            <h1 className="qs-titulo">
              Seu site.
              <br />
              Seus leads.
              <br />
              <span className="qs-tituloDestaque">Seu Power e CRM.</span>
            </h1>

            <p className="qs-subtitulo">
              O mesmo site da 21Go, no seu endereço. Quem cotar por ele cai direto no seu Power e
              CRM, e fala no seu WhatsApp.
            </p>

            <div className="qs-precoHero">
              <span className="qs-precoHeroCifra">R$</span>
              <span className="qs-precoHeroValor">80</span>
              <span className="qs-precoHeroMes">
                por mês
                <em>sem fidelidade</em>
              </span>
            </div>
          </header>

          <div className="qs-palcoForm">
            {/* O mockup fica ATRAS do formulario, inclinado: da a ideia do
                produto sem competir com a tarefa de preencher. */}
            <div className="qs-mockup" aria-hidden>
              <div className="qs-janela">
                <div className="qs-barra">
                  <span className="qs-bolinha" />
                  <span className="qs-bolinha" />
                  <span className="qs-bolinha" />
                  <div className="qs-url">21go.com.br/seunome</div>
                </div>
                <div className="qs-tela">
                  <div className="qs-telaLinha qs-w70" />
                  <div className="qs-telaLinha qs-w40" />
                  <div className="qs-telaBloco" />
                  <div className="qs-telaLinha qs-w55" />
                </div>
              </div>
            </div>

            <FormularioSite />
          </div>

          <ul className="qs-beneficios">
            <Beneficio n="01" titulo="Endereço próprio">
              21go.com.br/seunome, só seu, pra sempre
            </Beneficio>
            <Beneficio n="02" titulo="Cotação no seu nome">
              nasce dentro do seu Power e CRM, não na distribuição
            </Beneficio>
            <Beneficio n="03" titulo="Tráfego pago liberado">
              anuncie apontando pro seu link
            </Beneficio>
            <Beneficio n="04" titulo="Sem fidelidade">
              cancela quando quiser, sem multa
            </Beneficio>
          </ul>
        </div>
      </div>
    </>
  )
}

function Beneficio({
  n,
  titulo,
  children,
}: {
  n: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <li className="qs-beneficio">
      <span className="qs-beneficioN">{n}</span>
      <strong className="qs-beneficioTitulo">{titulo}</strong>
      <span className="qs-beneficioTexto">{children}</span>
    </li>
  )
}
