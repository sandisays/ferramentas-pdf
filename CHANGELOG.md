# Registro de mudanças

## 1.7.0 — 17/11/2026

Comparar PDFs (refeito)
- Lista de diferenças em cartões: tipo (alterado, removido, incluído), página, o texto antes e depois e um recorte ampliado do trecho nas duas versões, lado a lado.
- Lê as palavras na ordem de leitura (linha por linha) e ignora trechos que só mudaram de lugar, como rodapés lidos em outra ordem; mudanças na mesma linha viram um item só.
- Botão "Baixar relatório PDF" com todas as diferenças e os recortes, para arquivar ou enviar.
- As páginas inteiras lado a lado ficam recolhidas ("Ver as páginas inteiras").

Página
- O quadro "Antes de usar, saiba que" fica recolhido e abre ao clicar; agora fica abaixo da ferramenta escolhida.

## 1.6.1 — 15/11/2026

Melhorar digitalização
- Não aumenta mais a resolução além da digitalização original (lê o tamanho da imagem de cada página); num livro escaneado a 110 dpi o arquivo dobrava de tamanho e agora fica menor que o original.
- No modo colorido, o contraste só clareia o fundo, sem escurecer ilustrações e fotos.

## 1.6.0 — 15/11/2026

Novas ferramentas
- **Melhorar digitalização:** para PDF escaneado ou fotos. Endireita páginas tortas (perfil de projeção no miolo da página), pinta de branco a sombra e os cantos pretos ligados à borda, realça o contraste, deixa em cinza ou preto e branco (limiar adaptativo de Sauvola), tira páginas em branco e pode deixar o texto pesquisável (OCR). Mostra antes e depois da 1ª página.
- **Livreto:** monta o PDF para imprimir dobrado ao meio (completa com páginas em branco até múltiplo de 4) ou com 2, 4, 6 ou 9 páginas por folha, em A4 ou A3, com linha opcional de dobra ou corte. Respeita páginas giradas.

## 1.5.0 — 15/11/2026

Novas ferramentas
- **PDF → Excel:** usa o mesmo reconhecimento do conversor para Word; cada tabela vira uma aba, com células mescladas. Números no formato brasileiro (1.234,56) viram número; códigos e lotes com zero na frente ficam como texto.
- **Numerar e carimbar:** número de página em 5 formatos e 6 posições, começando em qualquer número e opção de pular a 1ª página; carimbo de texto na diagonal (marca d'água, com transparência), em cima ou embaixo, em 4 cores; pode valer só para algumas páginas.
- **Comparar PDFs:** compara o texto palavra por palavra (algoritmo de Myers) e marca em vermelho o que saiu e em verde o que entrou, lado a lado, com lista clicável das diferenças.
- **Assinar / imagem:** rubrica desenhada com o mouse ou imagem (com remoção do fundo branco), posicionada arrastando sobre as páginas; botão para repetir a mesma posição em todas.
- **Preencher formulário:** lista e preenche campos de texto, caixas, listas e opções; opção de fixar o formulário.
- **Senha:** protege com AES-256 ou remove a senha, usando o qpdf 12 em WebAssembly embutido (@neslinesli93/qpdf-wasm 0.3.1); o .wasm é entregue ao qpdf sem passar pela rede.
- **Informações:** páginas, tamanho da folha, se é escaneado, senha e bloqueios, campos de formulário e metadados; botão para limpar metadados (Info, XMP e PieceInfo).
- **Gerar QR Code:** texto ou link (com acentos) em PNG ou SVG, com escolha de correção de erro e tamanho (qrcode-generator 2.0.4).

Página inicial
- Ferramentas agrupadas em 4 colunas (Converter, Organizar, Revisar e assinar, Segurança e QR), botões compactos e a descrição da ferramenta escolhida embaixo do menu.

## 1.4.1 — 15/11/2026

Correção
- **Destacar:** em alguns navegadores (por exemplo, Safari e iPhone) o fundo não ficava desfocado nem escurecido; só apareciam as bordas. O desfoque agora é feito sem depender do filtro do navegador e funciona em todos.

## 1.4.0 — 15/11/2026

Novidades
- **Destacar com números (passo a passo):** opção "Numerar os destaques" em Tarjar e destacar. Cada destaque ganha um círculo com 1, 2, 3… na ordem em que foi marcado, contando todas as páginas. Ao remover um destaque, os outros são renumerados.

## 1.3.0 — 14/11/2026

Novidades
- **Ler QR Code:** nova ferramenta. Lê todos os QR Codes de cada página de um PDF, de uma imagem ou de um print colado com Ctrl+V (jsQR 1.4.0). O botão "Abrir o link" só abre o endereço quando a pessoa clica.

Conversor para Word
- Tabela cortada pela página (as colunas descem até o fim da folha sem linha de fechamento, como quando a tabela continua na página seguinte) agora vira tabela no Word, com células editáveis, em vez de texto solto com tabulações.


## 1.2.0 — 14/11/2026

Segurança
- pdf.js atualizado de 3.11.174 para 4.10.38, que corrige a CVE-2024-4367 (execução de código por fonte maliciosa). `npm audit` sem vulnerabilidades.

Qualidade
- Teste de regressão (`tests/test_regressao.py`): compara converter, comprimir, OCR, juntar, dividir, organizar e PDF→imagem entre duas versões. Da 1.1.0 para a 1.2.0 o Word gerado ficou idêntico (XML igual) nos 6 PDFs de teste, e os PDFs gerados mantiveram páginas e texto.

## 1.1.0 — 14/11/2026

Segurança
- **Tarjar e destacar:** o PDF baixado agora é montado em um documento novo. Antes, a página original (com o texto coberto pela tarja) continuava guardada dentro do arquivo e podia ser extraída. Arquivos tarjados com versões anteriores devem ser refeitos antes de sair da empresa.
- O arquivo tarjado não leva mais marcadores, anexos, formulários nem dados de título e autor do original.

Governança
- Versões das bibliotecas fixadas (`package.json` e `package-lock.json`); `npm run build` gera o `index.html` de forma reproduzível.
- Número da versão no rodapé da página.
- Teste automático de segurança (`npm test`): sem rede, sem dados gravados, tarja remove o texto original.
- Lista de bibliotecas de terceiros e licenças (`LICENCAS-TERCEIROS.md`).

SHA-256 do `index.html`: veja `SHA256SUMS`.

## 1.0.0

Versões anteriores a este registro (conversor para Word, OCR, tarjar, dividir, organizar, imagens, juntar e comprimir).
