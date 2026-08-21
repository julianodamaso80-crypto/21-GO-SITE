# -*- coding: utf-8 -*-
"""
Remove secoes H2 REDUNDANTES acumuladas pelos refreshes do Agente 14.

O Agente 14 injeta uma secao nova a cada refresh sem checar se o tema ja existe.
Depois de varios refreshes, os artigos de maior trafego viraram colcha de retalhos:
"carros-mais-roubados-rj-2026" tem 15 H2, sendo 3 variacoes de "como os criminosos
escolhem" e 3 de "como a 21Go ajuda". Google le isso como conteudo diluido — e sao
justamente as paginas que disputam o 1o lugar.

Criterio conservador (so remove quando e claramente redundante):
  - overlap de termos distintivos >= 0.7 com uma secao anterior
  - E a secao duplicada e MENOR que a que fica (mantem a mais completa)
  - nunca mexe nas secoes fixas (Em resumo / Perguntas frequentes / Fontes consultadas)
  - nunca deixa o artigo com menos de 900 palavras

Uso: python dedup-h2.py <pasta> [--apply]
"""
import io, os, re, sys, unicodedata

FIXAS = re.compile(r'^##\s*(em resumo|perguntas frequentes|fontes consultadas|faq)', re.I)
# Termos ONIPRESENTES entram na stoplist: sem isso "protecao veicular" domina a
# comparacao e dois H2 que perguntam coisas DIFERENTES sobre o mesmo carro parecem
# iguais. No dry-run isso ia cortar 3 secoes legitimas do artigo do Corolla Cross.
STOP = set(('no na do da de em o a os as para com seu sua rj rio janeiro 21go voce te '
            'que e ou um uma como qual quais protecao veicular patrimonial seguro '
            'associacao carro carros moto motos veiculo veiculos').split())

def norm(h):
    h = re.sub(r'^##\s+', '', h).lower()
    h = unicodedata.normalize('NFD', h)
    h = ''.join(c for c in h if unicodedata.category(c) != 'Mn')
    h = re.sub(r'[^a-z0-9\s]', ' ', h)
    toks = [re.sub(r's$', '', t) for t in h.split() if t not in STOP and len(t) > 2]
    return set(toks)

def overlap(a, b):
    if not a or not b: return 0.0
    return len(a & b) / min(len(a), len(b))

def jaccard(a, b):
    if not a or not b: return 0.0
    return len(a & b) / len(a | b)

NEG = re.compile(r'(nao|sem|nunca|evitar|errado)')
def nega(h):
    h = unicodedata.normalize('NFD', h.lower())
    h = ''.join(c for c in h if unicodedata.category(c) != 'Mn')
    return bool(NEG.search(h))

def split_sections(body):
    """[(heading|None, texto)] — o primeiro item e o preambulo antes do 1o H2."""
    idx = [m.start() for m in re.finditer(r'^##\s+.+$', body, re.M)]
    if not idx: return [(None, body)]
    out = [(None, body[:idx[0]])]
    for i, s in enumerate(idx):
        e = idx[i+1] if i+1 < len(idx) else len(body)
        bloco = body[s:e]
        out.append((bloco.split('\n', 1)[0], bloco))
    return out

def dedup(mdx):
    m = re.match(r'^(---\n[\s\S]+?\n---\n+)', mdx)
    fm, body = (m.group(1), mdx[len(m.group(1)):]) if m else ('', mdx)
    secs = split_sections(body)
    mantidas, removidas = [], []
    vistos = []  # (tokens, indice em mantidas)
    for head, txt in secs:
        if head is None or FIXAS.match(head.strip()):
            mantidas.append(txt); continue
        toks = norm(head)
        dup_i = None
        for tk, mi, htxt in vistos:
            # Jaccard, nao overlap coefficient: quando a stoplist reduz um heading a
            # poucos tokens ("Protecao para Carros e Motos com Motor Remarcado" vira
            # {motor, remarcado}), o overlap dispara 1.0 contra qualquer heading que
            # mencione o tema e conteudo unico ia embora.
            if len(toks & tk) < 2 or jaccard(toks, tk) < 0.7:
                continue
            # Negacao exclusiva = temas OPOSTOS, nao duplicados. "O Que NAO Deve Pesar
            # na Escolha" e "O Que DEVE Pesar" seriam fundidos sem esta guarda.
            if nega(head) != nega(htxt):
                continue
            dup_i = mi; break
        if dup_i is not None:
            anterior = mantidas[dup_i]
            # so remove se a nova for MENOR (mantem a versao mais completa)
            if len(txt) <= len(anterior):
                removidas.append(head.strip()); continue
            removidas.append(mantidas[dup_i].split('\n',1)[0].strip())
            mantidas[dup_i] = txt
            continue
        mantidas.append(txt)
        vistos.append((toks, len(mantidas)-1, head))
    novo = fm + ''.join(mantidas)
    novo = re.sub(r'\n{4,}', '\n\n\n', novo)
    return novo, removidas

def main():
    pasta = sys.argv[1]
    apply = '--apply' in sys.argv
    tot = mudados = 0
    palavras_antes = palavras_depois = 0
    for f in sorted(os.listdir(pasta)):
        if not f.endswith('.mdx'): continue
        p = os.path.join(pasta, f)
        s = io.open(p, encoding='utf-8').read()
        novo, rem = dedup(s)
        if not rem: continue
        wa, wd = len(s.split()), len(novo.split())
        if wd < 900:
            print('  PULADO (ficaria curto): %s (%d palavras)' % (f[:55], wd)); continue
        tot += len(rem); mudados += 1
        palavras_antes += wa; palavras_depois += wd
        print('%s  -%d secao(oes), %d -> %d palavras' % (f[:58], len(rem), wa, wd))
        for r in rem: print('      removida: %s' % r[:70])
        if apply:
            io.open(p, 'w', encoding='utf-8').write(novo)
    print('\n%s: %d artigos, %d secoes redundantes | palavras %d -> %d' %
          ('APLICADO' if apply else 'DRY-RUN', mudados, tot, palavras_antes, palavras_depois))

main()
