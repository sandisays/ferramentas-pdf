# Ferramentas PDF

Página única que roda inteira no navegador, **sem internet e sem enviar arquivos para lugar nenhum**:

- **Converter para Word** — PDF em .docx editável, com tabelas de verdade e o mesmo layout.
- **OCR** — PDF escaneado vira PDF pesquisável (texto invisível sobre a página); no conversor, escaneado vira Word editável.
- **Tarjar e destacar** — tarja preta que remove de verdade o conteúdo, dado fictício (lê o texto e sugere um substituto) e destaque que desfoca o resto da página, com prévia antes de baixar (PDF ou imagem).
- **Dividir**, **Organizar** (girar, apagar, reordenar), **Imagens → PDF** e **PDF → Imagem**.
- **Juntar PDFs** — escolha a ordem e as páginas de cada arquivo.
- **Comprimir PDF** — normal (reduz imagens, mantém o texto) ou forte (páginas viram imagem).
- **PDF → Excel** — cada tabela do PDF vira uma aba da planilha (.xlsx), com células mescladas e números de verdade.
- **Numerar e carimbar** — "Página 1 de N" e carimbo de texto (por exemplo, CÓPIA) na diagonal, em cima ou embaixo.
- **Comparar PDFs** — mostra, palavra por palavra, o que saiu e o que entrou entre duas versões.
- **Assinar / imagem** — rubrica desenhada ou imagem posicionada nas páginas (não é assinatura digital com certificado).
- **Preencher formulário** — preenche os campos de um PDF de formulário, com opção de fixar.
- **Senha** — protege com AES-256 ou remove a senha (sabendo a senha).
- **Informações** — páginas, tamanho da folha, se é escaneado, bloqueios, campos e metadados, com opção de limpar os metadados.
- **Melhorar digitalização** — endireita, limpa bordas, realça contraste, preto e branco, tira páginas em branco e OCR opcional.
- **Livreto** — imprimir dobrado ao meio ou 2, 4, 6, 9 páginas por folha.
- **Ler e gerar QR Code** — lê de PDF, foto ou print; gera PNG ou SVG.

## Como usar

- **Online:** abra o link do GitHub Pages deste repositório.
- **Offline:** baixe o `index.html` e abra com dois cliques no Chrome, Edge ou Firefox.

A conversão acontece no seu computador. A página bloqueia qualquer conexão de rede.

## Código

`src/` tem o motor de conversão (`engine.js`), o modelo da página (`template.html`) e o script que monta o `index.html` com as bibliotecas embutidas (pdf.js, JSZip, pdf-lib, docx-preview e Tesseract.js com o idioma português).

Para montar e testar:

```
npm ci            # instala as bibliotecas nas versões fixadas
npm run build     # gera o index.html e mostra o SHA-256
npm test          # testes de segurança (precisa de Python com playwright)
```

- `CHANGELOG.md`: o que mudou em cada versão. A versão aparece no rodapé da página.
- `SHA256SUMS`: impressão digital do `index.html` publicado, para conferir que a cópia em uso é a original (`sha256sum -c SHA256SUMS`).
- `LICENCAS-TERCEIROS.md`: bibliotecas embutidas, versões e licenças.
- `tests/test_seguranca.py`: confere que a página não acessa a rede, não grava dados e que a tarja remove de verdade o texto original.
- `tests/test_regressao.py`: compara as saídas de todas as abas entre a versão publicada e a nova antes de liberar uma atualização.

Desenvolvido por Sandi.
