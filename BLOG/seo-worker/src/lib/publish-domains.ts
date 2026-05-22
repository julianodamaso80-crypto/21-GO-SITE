/**
 * Lista de dominios onde a esteira SEO PUBLICA e INDEXA.
 *
 * Os 2 dominios apontam pro MESMO container (social-21go/site no Easypanel),
 * entao o MDX commitado aparece em ambos automaticamente. Falta so notificar
 * GSC + Bing + IndexNow de cada dominio separadamente.
 *
 * Regra dura (decisao user 2026-05-22): TODO blog gerado pela esteira deve ser
 * indexado em TODOS os dominios desta lista. Nunca esquecer nenhum.
 *
 * Pra adicionar um novo dominio:
 *  1. Adicionar entrada aqui
 *  2. Garantir que o /{INDEXNOW_KEY}.txt existe no /public e e servido pelo dominio
 *  3. Garantir propriedade verificada no GSC (sc-domain:{dominio})
 *  4. Garantir propriedade verificada no Bing Webmaster
 */
export interface PublishDomain {
  /** Dominio sem schema/path. Ex: '21go.site' */
  host: string;
  /** URL base com schema. Ex: 'https://21go.site' */
  siteUrl: string;
  /** Propriedade GSC. Ex: 'sc-domain:21go.site' */
  gscSite: string;
  /** Propriedade Bing WMT. Ex: 'https://21go.site/' (com barra final) */
  bingSite: string;
  /** URL absoluta do sitemap. */
  sitemap: string;
}

export const PUBLISH_DOMAINS: PublishDomain[] = [
  {
    host: '21go.site',
    siteUrl: 'https://21go.site',
    gscSite: 'sc-domain:21go.site',
    bingSite: 'https://21go.site/',
    sitemap: 'https://21go.site/sitemap.xml',
  },
  {
    host: '21goconsultoraleticya.site',
    siteUrl: 'https://21goconsultoraleticya.site',
    gscSite: 'sc-domain:21goconsultoraleticya.site',
    bingSite: 'https://21goconsultoraleticya.site/',
    sitemap: 'https://21goconsultoraleticya.site/sitemap.xml',
  },
];

/** Constroi a URL completa do artigo em um dominio especifico. */
export function urlFor(domain: PublishDomain, slug: string): string {
  return `${domain.siteUrl}/blog/${slug}`;
}
