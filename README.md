# Ferramentas PDF

Página única que roda inteira no navegador, **sem internet e sem enviar arquivos para lugar nenhum**:

- **Converter para Word** — PDF em .docx editável, com tabelas de verdade e o mesmo layout.
- **Juntar PDFs** — escolha a ordem e as páginas de cada arquivo.
- **Comprimir PDF** — normal (reduz imagens, mantém o texto) ou forte (páginas viram imagem).

## Como usar

- **Online:** abra o link do GitHub Pages deste repositório.
- **Offline:** baixe o `index.html` e abra com dois cliques no Chrome, Edge ou Firefox.

A conversão acontece no seu computador. A página bloqueia qualquer conexão de rede.

## Código

`src/` tem o motor de conversão (`engine.js`), o modelo da página (`template.html`) e o script que monta o `index.html` com as bibliotecas embutidas (pdf.js, JSZip e pdf-lib).

Desenvolvido por Sandi.
