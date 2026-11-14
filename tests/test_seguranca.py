#!/usr/bin/env python3
"""Testes de segurança das Ferramentas PDF (rodam no index.html já montado).

Precisa de:  pip install playwright  &&  playwright install chromium
Uso:         npm test        (ou: python3 tests/test_seguranca.py [caminho/do/index.html])

O que é conferido:
  1. A página abre sem erro e sem fazer nenhuma conexão de rede.
  2. Nada é gravado em localStorage, sessionStorage ou cookies.
  3. Depois de tarjar uma página, o texto original NÃO existe mais em lugar nenhum do
     PDF baixado, e a página que não foi tarjada continua com o texto dela.
"""
import os, re, sys, tempfile, zlib
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINA = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(RAIZ, 'index.html')
SEGREDO = b'SEGREDO-TARJA-123'
MANTER = b'PAGINA-DOIS-456'


def pdf_de_teste():
    """PDF de 2 páginas: a 1ª com o texto secreto, a 2ª com um texto que deve ficar."""
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
        None,
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
        None,
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    for i, txt in ((3, SEGREDO), (5, MANTER)):
        s = b'BT /F1 24 Tf 60 700 Td (' + txt + b') Tj ET'
        objs[i] = b'<< /Length %d >>\nstream\n' % len(s) + s + b'\nendstream'
    out, pos = b'%PDF-1.4\n', []
    for n, o in enumerate(objs, 1):
        pos.append(len(out))
        out += b'%d 0 obj\n' % n + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    out += b''.join(b'%010d 00000 n \n' % p for p in pos)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    return out


def conteudo_completo(pdf):
    """Devolve os bytes do arquivo somados a todos os streams descomprimidos."""
    partes = [pdf]
    for m in re.finditer(rb'stream\r?\n', pdf):
        fim = pdf.find(b'endstream', m.end())
        bruto = pdf[m.end():fim]
        try:
            partes.append(zlib.decompressobj().decompress(bruto))
        except zlib.error:
            pass
    return b'\n'.join(partes)


def contem(blob, texto):
    return texto in blob or texto.hex().encode() in blob.lower()


def main():
    falhas = []
    tmp = tempfile.mkdtemp()
    entrada = os.path.join(tmp, 'teste.pdf')
    open(entrada, 'wb').write(pdf_de_teste())
    assert contem(conteudo_completo(pdf_de_teste()), SEGREDO), 'o PDF de teste deveria conter o segredo'

    with sync_playwright() as p:
        nav = p.chromium.launch()
        pag = nav.new_page(viewport={'width': 1200, 'height': 900})
        rede, erros = [], []
        pag.on('request', lambda r: rede.append(r.url) if not r.url.startswith(('file:', 'blob:', 'data:')) else None)
        pag.on('pageerror', lambda e: erros.append(str(e)))
        pag.goto('file://' + PAGINA)

        pag.click('button[data-tab="red"]')
        pag.set_input_files('#file_red', entrada)
        pag.locator('#ed_red > *').nth(1).wait_for()
        if pag.is_checked('#redOcr'):
            pag.uncheck('#redOcr')
        primeira = pag.locator('#ed_red > *').first
        primeira.evaluate('e => e.scrollIntoView({block: "start"})')
        caixa = primeira.bounding_box()
        # o texto secreto fica no terço de cima da página; a tarja cobre essa faixa inteira
        pag.mouse.move(caixa['x'] + 8, caixa['y'] + 40)
        pag.mouse.down()
        pag.mouse.move(caixa['x'] + caixa['width'] - 8, caixa['y'] + 320, steps=6)
        pag.mouse.up()
        pag.locator('#go_red:not([disabled])').wait_for()
        pag.click('#go_red')
        pag.wait_for_selector('#res_red button')
        with pag.expect_download() as d:
            pag.locator('#res_red button', has_text='Baixar').first.click()
        saida = os.path.join(tmp, 'saida.pdf')
        d.value.save_as(saida)

        guardado = pag.evaluate('() => ({l: localStorage.length, s: sessionStorage.length, c: document.cookie})')
        versao = pag.inner_text('#appVersion')
        nav.close()

    tudo = conteudo_completo(open(saida, 'rb').read())
    if erros:
        falhas.append('erros de JavaScript na página: %s' % erros[:3])
    if rede:
        falhas.append('a página tentou acessar a rede: %s' % rede[:3])
    if guardado['l'] or guardado['s'] or guardado['c']:
        falhas.append('a página gravou dados no navegador: %s' % guardado)
    if contem(tudo, SEGREDO):
        falhas.append('TARJA: o texto original ainda está dentro do PDF baixado')
    if not contem(tudo, MANTER):
        falhas.append('a página sem tarja perdeu o texto')
    if len(re.findall(rb'/Type\s*/Page\b', tudo)) != 2:
        falhas.append('o PDF baixado não tem 2 páginas')

    print('Página testada: %s (%s)' % (PAGINA, versao))
    if falhas:
        print('FALHOU:')
        for f in falhas:
            print('  -', f)
        sys.exit(1)
    print('OK: sem rede, sem dados gravados, tarja remove o texto original, página sem tarja preservada.')


if __name__ == '__main__':
    main()
