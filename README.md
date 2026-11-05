# Valéria · Turnê de Aniversário

Site estático (HTML + CSS + JS, sem build). Publicado no GitHub Pages: https://juan-finger.github.io/valeria/

Fotos em `fotos/` (originais, nunca editados): `valeria-1.jpg` vestido verde-água, `valeria-2.jpg` selfie em círculo,
`valeria-3.webp` selfie ao ar livre, `valeria-4.jpg` foto de estúdio em grupo, `valeria-5.jpg` selfie na sala de reunião.

```
index.html              página
css/estilo.css          visual
js/musicas.js           ← LISTA DE MÚSICAS (edite aqui)
js/app.js               player, lightbox, medidor, velinhas, confete
fotos/                  valeria-1.jpg, valeria-2.jpg, valeria-3.png (originais)
fotos/web/              versões leves geradas pelo script (opcional)
scripts/otimizar_fotos.py
```

## Testar no computador

A música do YouTube **não toca abrindo o arquivo direto** (`file://`): o YouTube exige que a página tenha um endereço http. Sirva a pasta:

```bash
npx serve .
```

ou

```bash
python -m http.server 8000
```

e abra http://localhost:8000 (ou o endereço que o `serve` mostrar). Se abrir pelo arquivo, a página avisa.

## Antes de publicar

1. **Confira os IDs dos vídeos** em `js/musicas.js`. Cada linha diz se o ID foi confirmado ou não.
2. **Gere as fotos leves e a imagem de compartilhamento** (opcional, mas deixa tudo mais rápido no celular):

   ```bash
   pip install pillow
   ```

   ```bash
   python scripts/otimizar_fotos.py --base-url https://SEU-ENDERECO-PUBLICADO/
   ```

   Cria `fotos/web/*.webp` e `fotos/web/og-valeria.jpg` (colagem 1200x630 para o WhatsApp) e atualiza o `index.html`.
   Os originais não são alterados, e o lightbox continua mostrando o original.
3. Se não rodar o script, troque à mão o `og:image` do `index.html` por uma URL completa (WhatsApp ignora caminho relativo).

## Usar MP3 próprio no lugar do YouTube

Em `js/musicas.js`, preencha o campo `mp3` da faixa (ex.: `"musicas/night-changes.mp3"`) com um arquivo seu.
