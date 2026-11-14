#!/usr/bin/env python3
"""Teste de regressão: roda as abas principais em duas versões da página e compara as saídas.

Precisa de: pip install playwright pypdf  &&  playwright install chromium
Uso:  python3 tests/test_regressao.py <versao_antiga.html> <versao_nova.html> <pasta_com_pdfs>

Para cada PDF da pasta: converte para Word (com OCR), comprime (normal), gera imagens e
torna pesquisável (OCR). Também junta, divide e organiza. Compara o texto do Word, o número
de páginas e o tamanho dos arquivos entre as versões e lista as diferenças.
Também falha se houver erro de JavaScript ou tentativa de acesso à rede.
"""
import glob, io, json, os, re, sys, tempfile, time, zipfile
from playwright.sync_api import sync_playwright

ANTIGA, NOVA, PASTA = sys.argv[1:4]
PDFS = sorted(glob.glob(os.path.join(PASTA, '*.pdf')))


def esperar(pg, js, limite=600):
    fim = time.time() + limite
    while time.time() < fim:
        if pg.evaluate(js):
            return True
        time.sleep(0.5)
    raise TimeoutError(js)


def lista_pronta(lista):
    return ('() => { const s = [...document.querySelectorAll("#%s .st")];'
            ' return s.length > 0 && s.every(x => /\\b(ok|warn|err)\\b/.test(x.className)); }' % lista)


def rodar(pagina):
    saidas, erros, rede, status = {}, [], [], {}
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(viewport={'width': 1300, 'height': 1000}, accept_downloads=True)
        pg.on('pageerror', lambda e: erros.append(str(e)[:200]))
        pg.on('request', lambda r: rede.append(r.url) if not r.url.startswith(('file:', 'blob:', 'data:')) else None)
        pg.on('download', lambda d: saidas.__setitem__(d.suggested_filename, open(d.path(), 'rb').read()))
        pg.goto('file://' + os.path.abspath(pagina))

        def baixar_todos(botao, n):
            antes = len(saidas)
            pg.click(botao)
            fim = time.time() + 60
            while len(saidas) < antes + n and time.time() < fim:
                time.sleep(0.3)

        def textos(lista):
            return pg.evaluate('() => [...document.querySelectorAll("#%s li")].map(l => l.innerText.replace(/\\s+/g, " "))' % lista)

        # Converter para Word (OCR ligado)
        pg.click('button[data-tab="conv"]')
        pg.set_input_files('#file', PDFS)
        esperar(pg, lista_pronta('list'))
        status['converter'] = textos('list')
        baixar_todos('#all', len(PDFS))

        # Comprimir (normal, alvo 5 MB)
        pg.click('button[data-tab="comp"]')
        pg.set_input_files('#fileC', PDFS)
        esperar(pg, lista_pronta('listC'))
        status['comprimir'] = textos('listC')
        if pg.is_visible('#allC'):
            baixar_todos('#allC', len(PDFS))

        # OCR (pesquisável)
        pg.click('button[data-tab="ocr"]')
        pg.set_input_files('#fileO', [x for x in PDFS if 'escaneado' in x])
        esperar(pg, lista_pronta('listO'))
        status['ocr'] = textos('listO')
        if pg.is_visible('#allO'):
            baixar_todos('#allO', 1)

        # Juntar os três primeiros
        pg.click('button[data-tab="join"]')
        pg.set_input_files('#fileJ', PDFS[:3])
        esperar(pg, '() => !document.getElementById("goJ").disabled')
        time.sleep(1)
        with pg.expect_download():
            pg.click('#goJ')
        status['juntar'] = pg.inner_text('#resJ')

        # Dividir o maior por páginas (padrão da aba)
        pg.click('button[data-tab="split"]')
        pg.set_input_files('#file_split', PDFS[0])
        esperar(pg, '() => !document.getElementById("go_split").disabled')
        pg.click('#go_split')
        esperar(pg, '() => document.querySelector("#res_split .result") !== null')
        status['dividir'] = pg.inner_text('#res_split')

        # Organizar: salvar sem mudanças
        pg.click('button[data-tab="org"]')
        pg.set_input_files('#file_org', PDFS[0])
        esperar(pg, '() => !document.getElementById("go_org").disabled')
        pg.click('#go_org')
        esperar(pg, '() => document.querySelector("#res_org .result") !== null')
        status['organizar'] = pg.inner_text('#res_org')

        # PDF -> imagem
        pg.click('button[data-tab="pdf2img"]')
        pg.set_input_files('#file_pdf2img', PDFS[:2])
        esperar(pg, lista_pronta('list_pdf2img'))
        status['pdf2img'] = textos('list_pdf2img')
        nav.close()
    return saidas, erros, rede, status


def texto_docx(b):
    x = zipfile.ZipFile(io.BytesIO(b)).read('word/document.xml').decode()
    return re.sub(r'\s+', ' ', ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', x))).strip(), x


def paginas(b):
    from pypdf import PdfReader  # pip install pypdf
    return len(PdfReader(io.BytesIO(b)).pages)


def texto_pdf(b):
    from pypdf import PdfReader
    return re.sub(r'\s+', ' ', ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(b)).pages)).strip()


def main():
    resultado = {}
    for rotulo, pag in (('antiga', ANTIGA), ('nova', NOVA)):
        t = time.time()
        resultado[rotulo] = rodar(pag) + (round(time.time() - t),)
    A, N = resultado['antiga'], resultado['nova']
    problemas = []
    for rotulo, r in resultado.items():
        if r[1]:
            problemas.append('%s: erros de JavaScript %s' % (rotulo, r[1][:3]))
        if r[2]:
            problemas.append('%s: acesso à rede %s' % (rotulo, r[2][:3]))
    print('Tempo total: antiga %ss, nova %ss' % (A[4], N[4]))
    for aba in A[3]:
        if A[3][aba] != N[3].get(aba):
            print('\n[%s] mensagens diferentes\n  antiga: %s\n  nova:   %s' % (aba, A[3][aba], N[3].get(aba)))
    for nome in sorted(set(A[0]) | set(N[0])):
        a, n = A[0].get(nome), N[0].get(nome)
        if a is None or n is None:
            problemas.append('%s: só existe na versão %s' % (nome, 'nova' if a is None else 'antiga'))
            continue
        if nome.endswith('.docx'):
            ta, xa = texto_docx(a)
            tn, xn = texto_docx(n)
            igual_xml = xa == xn
            print('%-48s Word: texto %s, XML %s (%d/%d caracteres)' % (nome, 'igual' if ta == tn else 'DIFERENTE', 'igual' if igual_xml else 'diferente', len(ta), len(tn)))
            if ta != tn:
                import difflib
                d = [l for l in difflib.ndiff(ta.split(' '), tn.split(' ')) if l[0] in '+-'][:20]
                print('   ', ' '.join(d))
                problemas.append('%s: texto do Word mudou' % nome)
        elif nome.endswith('.pdf'):
            pa, pn = paginas(a), paginas(n)
            mesmo_texto = texto_pdf(a) == texto_pdf(n)
            print('%-48s PDF: páginas %d/%d, tamanho %d/%d KB, texto %s' % (nome, pa, pn, len(a) // 1024, len(n) // 1024, 'igual' if mesmo_texto else 'DIFERENTE'))
            if pa != pn:
                problemas.append('%s: número de páginas mudou' % nome)
            if not mesmo_texto:
                problemas.append('%s: texto do PDF mudou' % nome)
        else:
            print('%-48s %d/%d KB' % (nome, len(a) // 1024, len(n) // 1024))
    if problemas:
        print('\nATENÇÃO:')
        for p in problemas:
            print('  -', p)
        sys.exit(1)
    print('\nOK: mesmas saídas nas duas versões (texto do Word e páginas), sem erros nem acesso à rede.')


if __name__ == '__main__':
    main()
