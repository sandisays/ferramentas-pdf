# Ferramentas PDF

Página única que roda inteira no navegador, **sem internet e sem enviar arquivos para lugar nenhum**:

- **Converter para Word** — PDF em .docx editável, com tabelas de verdade e o mesmo layout.
- **OCR** — PDF escaneado vira PDF pesquisável (texto invisível sobre a página); no conversor, escaneado vira Word editável.
- **Tarjar e destacar** — tarja preta que remove de verdade o conteúdo, dado fictício (lê o texto e sugere um substituto) e destaque que desfoca o resto da página, com prévia antes de baixar (PDF ou imagem).
- **Dividir**, **Organizar** (girar, apagar, reordenar), **Imagens → PDF** e **PDF → Imagem**.
- **Juntar PDFs** — escolha a ordem e as páginas de cada arquivo.
- **Comprimir PDF** — normal (reduz imagens, mantém o texto) ou forte (páginas viram imagem).

## Como usar

- **Online:** abra o link do GitHub Pages deste repositório.
- **Offline:** baixe o `index.html` e abra com dois cliques no Chrome, Edge ou Firefox.

A conversão acontece no seu computador. A página bloqueia qualquer conexão de rede.

## Código

`src/` tem o motor de conversão (`engine.js`), o modelo da página (`template.html`) e o script que monta o `index.html` com as bibliotecas embutidas (pdf.js, JSZip, pdf-lib e Tesseract.js com o idioma português).

Desenvolvido por Sandi.
