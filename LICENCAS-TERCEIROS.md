# Bibliotecas de terceiros

O `index.html` embute as bibliotecas abaixo, nas versões fixadas em `package.json` e `package-lock.json`. Os textos completos das licenças ficam em `node_modules/<pacote>/` depois de `npm ci`.

| Biblioteca | Versão | Licença | Para que serve |
| --- | --- | --- | --- |
| pdf.js (`pdfjs-dist`) | 3.11.174 | Apache-2.0 | Ler e desenhar PDFs |
| pdf-lib | 1.17.1 | MIT | Criar e alterar PDFs |
| JSZip | 3.10.2 | MIT ou GPL-3.0 (usada sob MIT) | Montar arquivos .docx e .zip |
| docx-preview | 0.3.7 | Apache-2.0 | Prévia do Word na tela Comparar |
| Tesseract.js | 7.0.0 | Apache-2.0 | OCR (reconhecimento de texto) |
| tesseract.js-core | 6.1.2 | Apache-2.0 | Motor do OCR em WebAssembly |
| Dados de idioma português (`@tesseract.js-data/por`) | 1.0.0 | MIT | Modelo de português do OCR |
| Fonte Fredoka (`@fontsource/fredoka`) | 5.3.0 | OFL-1.1 | Fonte dos títulos |

## Observação de segurança

O pdf.js 3.11.174 tem a falha CVE-2024-4367 (execução de código por fonte maliciosa em versões anteriores à 4.2.67). Ela está mitigada nesta página de duas formas: todas as chamadas usam `isEvalSupported: false` e a política de segurança (CSP) não permite `eval`. A atualização para a série 4 ou superior exige adaptar o motor de conversão e fica registrada como pendência.
