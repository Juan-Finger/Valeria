#!/usr/bin/env python3
"""
Gera versões leves das fotos (WebP) e a imagem de compartilhamento (og:image),
SEM mexer nos originais e SEM alterar a aparência: só redimensiona proporcionalmente
e recorta/enquadra (nada de filtro, retoque ou esticar).

Uso (na pasta do site):
    pip install pillow
    python scripts/otimizar_fotos.py
    python scripts/otimizar_fotos.py --base-url https://seu-usuario.github.io/valeria/

O que ele faz:
  fotos/web/valeria-1.webp, valeria-2.webp, valeria-3.webp  (máx. 1400 px no lado maior)
  fotos/web/og-valeria.jpg  (1200x630, colagem das 3 fotos em moldura, para o WhatsApp)
  e atualiza o index.html para usar esses arquivos (as <img data-foto> e o og:image).
  A foto ampliada no lightbox continua usando o original, com qualidade máxima.
"""
import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageOps
except ImportError:
    sys.exit("Instale o Pillow antes:  pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
FOTOS = ROOT / "fotos"
WEB = FOTOS / "web"
INDEX = ROOT / "index.html"

ORIGINAIS = {
    "valeria-1": "valeria-1.jpg",   # vestido verde-água (print com "1/3")
    "valeria-2": "valeria-2.jpg",   # selfie em círculo
    "valeria-3": "valeria-3.webp",  # selfie quadrada
    "valeria-4": "valeria-4.jpg",   # foto de estúdio em grupo
    "valeria-5": "valeria-5.jpg",   # selfie na sala de reunião
}
MAX_LADO = 1400

PAPER = (246, 239, 228)
INK = (27, 31, 59)
RED = (217, 43, 36)
WHITE = (255, 255, 255)


def abrir(nome):
    p = FOTOS / nome
    if not p.exists():
        sys.exit(f"Não achei {p}. Coloque as fotos na pasta fotos/ com esses nomes: {', '.join(ORIGINAIS.values())}")
    im = Image.open(p)
    im = ImageOps.exif_transpose(im)  # só corrige a orientação salva pela câmera
    return im.convert("RGB")


def reduzir(im):
    w, h = im.size
    f = min(1.0, MAX_LADO / max(w, h))
    if f < 1:
        im = im.resize((round(w * f), round(h * f)), Image.LANCZOS)  # proporcional
    return im


def cortar_cover(im, ratio, pos_x=0.5, pos_y=0.5):
    """Igual ao object-fit:cover + object-position do CSS."""
    w, h = im.size
    if w / h > ratio:
        cw, ch = round(h * ratio), h
    else:
        cw, ch = w, round(w / ratio)
    x = round((w - cw) * pos_x)
    y = round((h - ch) * pos_y)
    return im.crop((x, y, x + cw, y + ch))


def cortar_circulo_foto2(im):
    """Foto 2: centro (602,456), raio ~397 em 1206x943. Usamos raio 385 (sem a borda desfocada)."""
    w, h = im.size
    s = w / 1206
    cx, cy, r = 602 * s, 456 * s, 385 * s
    return im.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r)))


def polaroid(foto, borda=14, base=60):
    w, h = foto.size
    card = Image.new("RGB", (w + borda * 2, h + borda + base), WHITE)
    card.paste(foto, (borda, borda))
    return card


def colar_girado(canvas, img, xy, ang, mask=None):
    img = img.convert("RGBA")
    if mask is not None:
        img.putalpha(mask)
    rot = img.rotate(ang, resample=Image.BICUBIC, expand=True)
    sombra = Image.new("RGBA", rot.size, (0, 0, 0, 0))
    sombra.paste((15, 17, 34, 90), (0, 0), rot.split()[-1])
    canvas.alpha_composite(sombra, (xy[0] + 8, xy[1] + 12))
    canvas.alpha_composite(rot, xy)


def gerar_og(f1, f2, f3, destino):
    W, H = 1200, 630
    cv = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(cv)
    for y in range(0, H, 14):  # retícula discreta
        for x in range((y // 14) % 2 * 7, W, 14):
            d.ellipse((x - 1.6, y - 1.6, x + 1.6, y + 1.6), fill=(244, 166, 184, 255))
    d.rectangle((0, H - 22, W, H), fill=RED)

    # mesmo enquadramento do CSS: tira 3% de cima (faixa branca) e encosta na esquerda (longe do "1/3")
    w, h = f1.size
    f1 = f1.crop((0, round(h * 0.03), w, h))
    p1 = polaroid(cortar_cover(f1, 3 / 4, 0.0, 1.0).resize((330, 440), Image.LANCZOS))
    colar_girado(cv, p1, (50, 40), 4)

    p3 = polaroid(cortar_cover(f3, 1).resize((300, 300), Image.LANCZOS), base=40)
    colar_girado(cv, p3, (405, 140), -3)

    lado = 340
    c = cortar_circulo_foto2(f2).resize((lado, lado), Image.LANCZOS)
    disco = Image.new("RGBA", (lado + 120, lado + 120), (0, 0, 0, 0))
    dd = ImageDraw.Draw(disco)
    dd.ellipse((0, 0, lado + 119, lado + 119), fill=(14, 16, 32, 255))
    for r in range(8, 60, 5):
        dd.ellipse((r, r, lado + 119 - r, lado + 119 - r), outline=(30, 34, 56, 255), width=1)
    dd.ellipse((52, 52, lado + 67, lado + 67), fill=RED)
    m = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(m).ellipse((0, 0, lado - 1, lado - 1), fill=255)
    rot = c.convert("RGBA")
    rot.putalpha(m)
    disco.alpha_composite(rot, (60, 60))
    colar_girado(cv, disco, (W - lado - 150, 70), 0)

    cv.convert("RGB").save(destino, "JPEG", quality=86, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="", help="URL pública do site, para o og:image ficar absoluto")
    a = ap.parse_args()

    WEB.mkdir(parents=True, exist_ok=True)
    fotos = {}
    for chave, nome in ORIGINAIS.items():
        im = abrir(nome)
        fotos[chave] = im
        out = WEB / f"{chave}.webp"
        if nome.endswith(".webp") and max(im.size) <= MAX_LADO:
            out.write_bytes((FOTOS / nome).read_bytes())  # já é WebP pequeno: só copia, sem recomprimir
        else:
            reduzir(im).save(out, "WEBP", quality=82, method=6)
        antes = (FOTOS / nome).stat().st_size // 1024
        depois = out.stat().st_size // 1024
        print(f"  {nome:15} {im.size[0]}x{im.size[1]}  {antes:5} KB  ->  {out.relative_to(ROOT)}  {depois} KB")

    og = WEB / "og-valeria.jpg"
    gerar_og(fotos["valeria-1"], fotos["valeria-2"], fotos["valeria-3"], og)
    print(f"  imagem de compartilhamento -> {og.relative_to(ROOT)}")

    html = INDEX.read_text(encoding="utf-8")
    html = re.sub(r'(<img data-foto src=")fotos/(valeria-\d)\.(?:jpg|jpeg|png|webp)"', r'\1fotos/web/\2.webp"', html)
    base = a.base_url.rstrip("/") + "/" if a.base_url else ""
    html = re.sub(r'(<meta property="og:image" content=")[^"]*"', rf'\g<1>{base}fotos/web/og-valeria.jpg"', html)
    INDEX.write_text(html, encoding="utf-8")
    print("  index.html atualizado.")
    if not base:
        print("\n  Lembrete: rode de novo com --base-url https://... depois de publicar, para o WhatsApp achar a imagem.")
    print("  Confira fotos/web/og-valeria.jpg: o indicador \"1/3\" da foto 1 deve ter ficado fora do corte.")


if __name__ == "__main__":
    main()
