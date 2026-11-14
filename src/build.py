import re
def js(p):
    s=open(p,encoding='utf-8').read()
    s=re.sub(r'//# sourceMappingURL=.*','',s)
    return s.replace('</script','<\\/script').replace('<!--','<\\!--')
t=open('template.html',encoding='utf-8').read()
for k,p in [('PDFJS','node_modules/pdfjs-dist/legacy/build/pdf.min.js'),('WORKER','node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js'),('JSZIP','node_modules/jszip/dist/jszip.min.js'),('DOCXPREV','node_modules/docx-preview/dist/docx-preview.min.js'),('PDFLIB','node_modules/pdf-lib/dist/pdf-lib.min.js'),('TESS','node_modules/tesseract.js/dist/tesseract.min.js'),('TESSWORKER','node_modules/tesseract.js/dist/worker.min.js'),('TESSCORE','node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),('ENGINE','engine.js')]:
    t=t.replace('/*__%s__*/'%k,js(p))
import base64
t=t.replace('__DICT__',open('dict.b64' if __import__('os').path.exists('dict.b64') else '../dict/dict.b64').read())
t=t.replace('/*__TESSLANG__*/','self.__TL={por:"'+base64.b64encode(open('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz','rb').read()).decode()+'"};')
for w in ('600','700'):
    t=t.replace('/*__FREDOKA%s__*/'%w, base64.b64encode(open('node_modules/@fontsource/fredoka/files/fredoka-latin-%s-normal.woff2'%w,'rb').read()).decode())
open('../out/conversor-pdf-word.html','w',encoding='utf-8').write(t)
print(len(t)//1024,'KB')
