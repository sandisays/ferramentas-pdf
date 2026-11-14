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


t = ler(SRC, 'template.html')
for chave, caminho in [
    ('PDFJS', os.path.join(NM, 'pdfjs-dist/legacy/build/pdf.min.js')),
    ('WORKER', os.path.join(NM, 'pdfjs-dist/legacy/build/pdf.worker.min.js')),
    ('JSZIP', os.path.join(NM, 'jszip/dist/jszip.min.js')),
    ('DOCXPREV', os.path.join(NM, 'docx-preview/dist/docx-preview.min.js')),
    ('PDFLIB', os.path.join(NM, 'pdf-lib/dist/pdf-lib.min.js')),
    ('TESS', os.path.join(NM, 'tesseract.js/dist/tesseract.min.js')),
    ('TESSWORKER', os.path.join(NM, 'tesseract.js/dist/worker.min.js')),
    ('TESSCORE', os.path.join(NM, 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js')),
    ('ENGINE', os.path.join(SRC, 'engine.js')),
]:
    t = t.replace('/*__%s__*/' % chave, js(caminho))

t = t.replace('__DICT__', ler(SRC, 'dict.b64'))
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
