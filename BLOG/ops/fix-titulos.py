# -*- coding: utf-8 -*-
"""
Reescreve title/description dos artigos que disputam o topo, COM acentuacao correta.

Diagnostico (GSC + SERP real, 21/08): os concorrentes que nos passam prometem o dado
("Ranking Completo", "Lista Atualizada"); os nossos prometiam a marca ("...e Como se
Proteger com a 21Go"), o que dilui a promessa informacional e custa o clique. E onde a
resposta ja aparece na propria SERP (caso do "RM no documento", 8 queries com 0 clique),
o titulo passa a prometer o que o snippet NAO entrega: o que fazer a respeito.
"""
import io, os, re, sys

MUDANCAS = {
    'carros-mais-roubados-rj-2026.mdx': (
        'Carros Mais Roubados no RJ em 2026: Ranking Completo e Atualizado',
        'Ranking completo dos carros mais roubados no Rio de Janeiro em 2026, com os '
        'modelos mais visados, os bairros de maior risco e o que fazer se o seu está na lista.',
    ),
    'motos-mais-roubadas-em-bangu-rj-2026.mdx': (
        'Motos Mais Roubadas no RJ em 2026: Ranking e Regiões de Risco',
        'Ranking das motos mais roubadas no Rio de Janeiro em 2026, as regiões com maior '
        'incidência e o que fazer para reduzir o risco da sua.',
    ),
    'carro-rm-no-rio-entenda-a-classificacao-e-suas-implicacoes.mdx': (
        'RM no Documento: O Que Muda ao Vender ou Proteger o Carro',
        'RM significa recuperado de roubo ou furto. Veja o que a anotação muda no valor de '
        'revenda, na aceitação por seguradoras e o que fazer se o seu carro tem RM.',
    ),
    'veiculo-remarcado-o-que-e-tem-protecao.mdx': (
        'Veículo Remarcado: O Que É, Riscos e Quem Aceita Proteger',
        'Chassi ou motor remarcado muda a documentação e o valor do veículo. Entenda os '
        'riscos reais, o que exige o Detran e quem aceita proteger um carro remarcado.',
    ),
}


def main(pasta):
    for arq, (titulo, desc) in MUDANCAS.items():
        caminho = os.path.join(pasta, arq)
        if not os.path.exists(caminho):
            print('AUSENTE: %s' % arq)
            continue
        s = io.open(caminho, encoding='utf-8').read()
        antes = re.search(r"^title:\s*'?(.+?)'?\s*$", s, re.M)

        s = re.sub(r"^title:.*$", "title: '%s'" % titulo.replace("'", ""), s, count=1, flags=re.M)
        # description pode ser bloco (>-) ou linha unica
        if re.search(r"^description: >-\n(?:  .*\n)+", s, re.M):
            s = re.sub(r"^description: >-\n(?:  .*\n)+", "description: >-\n  %s\n" % desc, s, count=1, flags=re.M)
        else:
            s = re.sub(r"^description:.*$", "description: >-\n  %s" % desc, s, count=1, flags=re.M)

        # sinaliza atualizacao pro Google reprocessar a pagina
        if re.search(r"^last_updated:", s, re.M):
            s = re.sub(r"^last_updated:.*$", "last_updated: '2026-08-21'", s, count=1, flags=re.M)
        else:
            s = re.sub(r"^(date:.*)$", r"\1\nlast_updated: '2026-08-21'", s, count=1, flags=re.M)

        io.open(caminho, 'w', encoding='utf-8').write(s)
        print('OK  %s' % arq)
        print('    antes: %s' % (antes.group(1)[:70] if antes else '?'))
        print('    agora: %s  (%d chars)' % (titulo, len(titulo)))


main(sys.argv[1] if len(sys.argv) > 1 else '.')
