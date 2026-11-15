#!/usr/bin/env python3
"""Monta o index.html com todas as bibliotecas embutidas.

Uso (na raiz do repositório):  npm ci  &&  npm run build
As versões das bibliotecas ficam fixadas em package.json e package-lock.json.
Ao final imprime o SHA-256 do index.html: registre-o no CHANGELOG a cada versão.
"""
import base64, hashlib, json, os, re

SRC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SRC)
NM = os.path.join(ROOT, 'node_modules')


def ler(*partes):
    return open(os.path.join(*partes), encoding='utf-8').read()


def js(caminho):
    s = ler(caminho)
    s = re.sub(r'//# sourceMappingURL=.*', '', s)
    return s.replace('</script', '<\\/script').replace('<!--', '<\\!--')


def modulo_como_script(caminho, global_):
    """Converte o pdf.min.mjs (módulo) em script comum que publica as exportações em window.

    O pdf.js 4 só é distribuído como módulo; um script comum embutido mantém a ordem de
    carregamento da página e funciona aberto direto do disco. import.meta.url só aparece nos trechos exclusivos do Node."""
    s = js(caminho).replace('import.meta.url', '""')
    m = re.search(r'export\{([^}]*)\};?\s*$', s)
    if not m:
        raise SystemExit('formato inesperado em %s' % caminho)
    pares = []
    for item in m.group(1).split(','):
        local, nome = [x.strip() for x in item.split(' as ')]
        pares.append('%s:%s' % (nome, local))
    return s[:m.start()] + 'globalThis.%s={%s};' % (global_, ','.join(pares))


t = ler(SRC, 'template.html')
for chave, caminho in [
    ('JSZIP', os.path.join(NM, 'jszip/dist/jszip.min.js')),
    ('DOCXPREV', os.path.join(NM, 'docx-preview/dist/docx-preview.min.js')),
    ('JSQR', os.path.join(NM, 'jsqr/dist/jsQR.js')),
    ('QRGEN', os.path.join(NM, 'qrcode-generator/dist/qrcode.js')),
    ('QPDF', os.path.join(NM, '@neslinesli93/qpdf-wasm/dist/qpdf.js')),
    ('PDFLIB', os.path.join(NM, 'pdf-lib/dist/pdf-lib.min.js')),
    ('TESS', os.path.join(NM, 'tesseract.js/dist/tesseract.min.js')),
    ('TESSWORKER', os.path.join(NM, 'tesseract.js/dist/worker.min.js')),
    ('TESSCORE', os.path.join(NM, 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js')),
    ('ENGINE', os.path.join(SRC, 'engine.js')),
]:
    t = t.replace('/*__%s__*/' % chave, js(caminho))
t = t.replace('/*__PDFJS__*/', modulo_como_script(os.path.join(NM, 'pdfjs-dist/legacy/build/pdf.min.mjs'), 'pdfjsLib'))
# o worker também vira script comum: worker de módulo a partir de blob não abre em página local (file://)
t = t.replace('/*__WORKER__*/', modulo_como_script(os.path.join(NM, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'pdfjsWorker'))

t = t.replace('__DICT__', ler(SRC, 'dict.b64'))
with open(os.path.join(NM, '@neslinesli93/qpdf-wasm/dist/qpdf.wasm'), 'rb') as fq:
    t = t.replace('/*__QPDFWASM__*/', base64.b64encode(fq.read()).decode())
lang = open(os.path.join(NM, '@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'), 'rb').read()
t = t.replace('/*__TESSLANG__*/', 'self.__TL={por:"' + base64.b64encode(lang).decode() + '"};')
for peso in ('600', '700'):
    fonte = open(os.path.join(NM, '@fontsource/fredoka/files/fredoka-latin-%s-normal.woff2' % peso), 'rb').read()
    t = t.replace('/*__FREDOKA%s__*/' % peso, base64.b64encode(fonte).decode())

versao = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))['version']
t = t.replace('__VERSION__', versao)

saida = os.path.join(ROOT, 'index.html')
dados = t.encode('utf-8')
open(saida, 'wb').write(dados)
print('index.html v%s  %d KB  SHA-256 %s' % (versao, len(dados) // 1024, hashlib.sha256(dados).hexdigest()))
