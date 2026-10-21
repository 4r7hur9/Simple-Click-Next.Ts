#!/usr/bin/env python3
"""Gera os ativos de produto da landing (recorte com alfa + sombra de contato).

Uso (da raiz do repositório):
  python3 -m venv /tmp/landing-produtos/venv
  /tmp/landing-produtos/venv/bin/pip install pillow numpy scipy rembg onnxruntime pymatting
  /tmp/landing-produtos/venv/bin/python scripts/ativos-da-landing/gerar.py [--pasta-de-trabalho /tmp/landing-produtos]

Saída: apps/web/public/landing/produtos/{hamburguer,hamburguer-800,peca,peca-800,sombra}.webp
e um teste de composição em <pasta-de-trabalho>/teste-*.png (fundo #0e1110, verde e claro).
Rede só para baixar a foto do hambúrguer (Pexels) e o modelo isnet-general-use (rembg).
"""
import argparse, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAIDA = os.path.join(RAIZ, "apps/web/public/landing/produtos")

HAMBURGUER_URL = "https://images.pexels.com/photos/38660122/pexels-photo-38660122.jpeg"
# Peça da UniversoKar já importada no projeto.
PECA = os.path.join(RAIZ, "apps/web/public/demo/universokar/13775-b48beb13fa5b.jpg")


def baixar(url, destino):
    if not os.path.exists(destino):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(destino, "wb") as f:
            f.write(r.read())
    return destino


def recortar(img, sessao, *, erodir=2, suavizar=0.8, matting=True, piso=0.04):
    """Devolve RGBA sem halo: máscara do rembg (+ matting), erosão leve e cor de
    primeiro plano estimada (tira a contaminação do fundo nas bordas)."""
    from rembg import remove
    from pymatting import estimate_foreground_ml
    from scipy import ndimage as ndi

    rgb = img.convert("RGB")
    kw = dict(session=sessao, only_mask=True)
    if matting:
        kw.update(alpha_matting=True, alpha_matting_foreground_threshold=235,
                  alpha_matting_background_threshold=15, alpha_matting_erode_size=12)
    m = remove(rgb, **kw)
    a = np.asarray(m, dtype=np.float32) / 255.0
    if erodir:
        a = ndi.grey_erosion(a, size=(erodir, erodir))
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(suavizar)),
                   dtype=np.float32) / 255.0
    # curva que fecha o miolo e afina a borda
    a = np.clip((a - piso) / (0.96 - piso), 0, 1)
    x = np.asarray(rgb, dtype=np.float32) / 255.0
    fg = estimate_foreground_ml(x, a)
    out = np.dstack([np.clip(fg, 0, 1), a])
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def aparar(img, margem=0.0):
    a = np.asarray(img.split()[3])
    ys, xs = np.where(a > 8)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return img.crop(box), box


def tamanho(img, maior):
    w, h = img.size
    k = maior / max(w, h)
    novo = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
    if k > 1:  # ampliação: devolve um pouco da nitidez (só nas cores, o alfa fica como está)
        rgb = novo.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
        novo = Image.merge("RGBA", (*rgb.split(), novo.split()[3]))
    return novo


def sombra(largura=1600, altura=360):
    """Sombra de contato: elipse preta com gradiente radial (alfa), bem concentrada no centro."""
    y, x = np.mgrid[0:altura, 0:largura].astype(np.float32)
    nx = (x - largura / 2) / (largura / 2)
    ny = (y - altura / 2) / (altura / 2)
    d = np.sqrt(nx ** 2 + ny ** 2)
    nucleo = np.clip(1 - d, 0, 1) ** 1.6 * 0.85           # miolo escuro
    halo = np.clip(1 - d, 0, 1) ** 3.2 * 0.35               # cauda longa e suave
    a = np.clip(nucleo + halo, 0, 1)
    rgba = np.zeros((altura, largura, 4), np.uint8)
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def salvar(img, nome, q=85):
    os.makedirs(SAIDA, exist_ok=True)
    img.save(os.path.join(SAIDA, nome), "WEBP", quality=q, method=6, alpha_quality=95)


def teste(produtos, shadow, caminho, fundo, h=900):
    larg = 1700
    t = Image.new("RGB", (larg, h), fundo)
    xs = [larg * 0.27, larg * 0.73]
    for (img, esc), cx in zip(produtos, xs):
        im = tamanho(img, int(esc * 650))
        s = shadow.resize((int(im.width * 1.15), int(im.width * 0.2)), Image.LANCZOS)
        base = int(h * 0.74)
        t.paste(s, (int(cx - s.width / 2), int(base - s.height * 0.5)), s)
        t.paste(im, (int(cx - im.width / 2), base - im.height + int(im.height * 0.03)), im)
    t.save(caminho)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pasta-de-trabalho", default="/tmp/landing-produtos")
    ap.add_argument("--peca", default="13775-b48beb13fa5b.jpg")
    ap.add_argument("--so-teste", action="store_true")
    args = ap.parse_args()
    tr = args.pasta_de_trabalho
    os.makedirs(tr, exist_ok=True)
    os.environ.setdefault("U2NET_HOME", os.path.join(tr, "modelos"))
    from rembg import new_session
    sessao = new_session("isnet-general-use")

    # 1) hambúrguer
    orig = Image.open(baixar(HAMBURGUER_URL, os.path.join(tr, "hamburguer-original.jpg"))).convert("RGB")
    caixa = (330, 1080, 1820, 2300)   # corta o palco (a fatia de ardósia e o preto sobram)
    ham = recortar(orig.crop(caixa), sessao)
    ham, _ = aparar(ham)
    ham.save(os.path.join(tr, "hamburguer-full.png"))

    # 2) peça
    pec = Image.open(os.path.join(RAIZ, "apps/web/public/demo/universokar", args.peca)).convert("RGB")
    pec = recortar(pec, sessao, erodir=3, suavizar=0.7, matting=False, piso=0.35)
    pec, _ = aparar(pec)
    pec.save(os.path.join(tr, "peca-full.png"))

    sh = sombra()
    for nome, img in (("hamburguer", ham), ("peca", pec)):
        g, p = tamanho(img, 1600), tamanho(img, 800)
        if not args.so_teste:
            salvar(g, f"{nome}.webp"); salvar(p, f"{nome}-800.webp")
    if not args.so_teste:
        salvar(sh, "sombra.webp", q=90)
    esc = (ham.width / max(ham.size), pec.width / max(pec.size))
    for nome, cor in (("preto", "#0e1110"), ("verde", "#0f8a4f"), ("claro", "#ececec")):
        teste([(tamanho(ham, 1600), 1.0), (tamanho(pec, 1600), 0.85)], sh,
              os.path.join(tr, f"teste-{nome}.png"), cor)
    print("ok", ham.size, pec.size)


if __name__ == "__main__":
    main()
