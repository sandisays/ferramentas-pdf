# Registro de mudanças

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
