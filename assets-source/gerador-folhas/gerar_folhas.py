"""
Gera os ramos de folhas em aquarela do fundo do aplicativo (PNG transparente).

Por que existe: o pacote de telas (assets-source/familia-saude-telas-selecionadas)
so tem composicoes achatadas — nenhuma folha isolada com transparencia. As
faixas antigas (leaves-left/right.png) eram recortes de 68 px das bordas do
mockup, cortados em linha reta, e por isso os cartoes pareciam "colados por
cima". Aqui cada ramo e desenhado do zero, com o mesmo vocabulario do mockup:
caule curvo, folhas lanceoladas alternadas, verde-salvia/musgo em aquarela.

Deterministico (semente fixa): rodar de novo gera os mesmos arquivos.

Uso:
    python gerar_folhas.py <pasta-de-saida> [--previa <arquivo.png>]

Dependencias: pillow, numpy (num venv; nao entram no projeto).
"""

from __future__ import annotations

import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Paletas -------------------------------------------------------------------

# Tons do mockup (medidos nas folhas de home-screen-warm-family.png).
VERDES = [(92, 108, 66), (118, 136, 82), (104, 122, 74), (140, 156, 100), (80, 96, 60)]
# Para DENTRO dos cartoes coloridos (caramelo -> verde): folha clara, creme-salvia.
CLAROS = [(233, 227, 196), (214, 218, 178), (201, 207, 164), (188, 197, 150)]


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


# Ruido ---------------------------------------------------------------------


def ruido(w: int, h: int, escala: int, rng: np.random.Generator) -> np.ndarray:
    """Ruido suave em [0,1]: grade pequena aleatoria ampliada (bicubica)."""
    pw, ph = max(2, w // escala), max(2, h // escala)
    base = (rng.random((ph, pw)) * 255).astype(np.uint8)
    img = Image.fromarray(base, 'L').resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def borrar(a: np.ndarray, raio: float) -> np.ndarray:
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'L')
    return np.asarray(img.filter(ImageFilter.GaussianBlur(raio)), dtype=np.float32) / 255.0


# Geometria -----------------------------------------------------------------


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
    y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
    return x, y


def tangente(p0, p1, p2, p3, t):
    a = bezier(p0, p1, p2, p3, max(0.0, t - 0.01))
    b = bezier(p0, p1, p2, p3, min(1.0, t + 0.01))
    return math.atan2(b[1] - a[1], b[0] - a[0])


def contorno_da_folha(base, angulo, comp, larg, curva, rng):
    """Folha lanceolada: larga no primeiro terco, ponta fina, leve assimetria."""
    pts_e, pts_d = [], []
    assim = 1 + rng.uniform(-0.12, 0.12)
    n = 40
    for i in range(n + 1):
        t = i / n
        meia = larg * (math.sin(math.pi * t) ** 0.85) * (1 - 0.35 * t)
        # A nervura central e curva: a folha "cai" levemente.
        desvio = curva * comp * math.sin(math.pi * t) * 0.18
        x = t * comp
        pts_e.append((x, desvio - meia * assim))
        pts_d.append((x, desvio + meia / assim))
    pts = pts_e + pts_d[::-1]
    c, s = math.cos(angulo), math.sin(angulo)
    nervura = [(base[0] + x * c - y * s, base[1] + x * s + y * c) for x, y in
               [(t / n * comp, curva * comp * math.sin(math.pi * t / n) * 0.18) for t in range(n + 1)]]
    return [(base[0] + x * c - y * s, base[1] + x * s + y * c) for x, y in pts], nervura


# Pintura -------------------------------------------------------------------


class Tela:
    """Acumula pigmento (cor + alfa) com o operador 'over', em float."""

    def __init__(self, w: int, h: int, rng: np.random.Generator):
        self.w, self.h, self.rng = w, h, rng
        self.cor = np.zeros((h, w, 3), np.float32)
        self.alfa = np.zeros((h, w), np.float32)
        self.papel = 0.82 + 0.18 * ruido(w, h, 6, rng)  # granulado do papel

    def mascara(self, poligono=None, linha=None, largura=1):
        img = Image.new('L', (self.w, self.h), 0)
        d = ImageDraw.Draw(img)
        if poligono:
            d.polygon(poligono, fill=255)
        if linha:
            d.line(linha, fill=255, width=largura, joint='curve')
        return np.asarray(img, np.float32) / 255.0

    def pintar(self, a: np.ndarray, cor):
        a = np.clip(a, 0, 1)
        c = np.array(cor, np.float32) / 255.0
        novo = a + self.alfa * (1 - a)
        with np.errstate(invalid='ignore', divide='ignore'):
            self.cor = np.where(
                novo[..., None] > 0,
                (c * a[..., None] + self.cor * (self.alfa * (1 - a))[..., None]) / novo[..., None],
                self.cor,
            )
        self.alfa = novo

    def folha(self, contorno, nervura, cor, opacidade):
        m = self.mascara(poligono=contorno)
        if m.max() == 0:
            return
        macia = borrar(m, 2.2)
        # Borda "molhada": o pigmento acumula na margem quando a aguada seca.
        borda = np.clip(macia - borrar(m, 7), 0, 1) * 1.6
        # Aguada irregular por dentro.
        aguada = 0.68 + 0.3 * ruido(self.w, self.h, 40, self.rng)
        a = (macia * aguada + borda * 0.45) * opacidade * self.papel
        escura = tuple(max(0, int(v * 0.82)) for v in cor)
        self.pintar(a, cor)
        self.pintar(borda * 0.35 * opacidade * self.papel, escura)
        # Nervura: risco claro, como pincel que levantou tinta.
        v = self.mascara(linha=nervura, largura=3)
        v = borrar(v, 1.0) * macia
        clara = tuple(min(255, int(x + (255 - x) * 0.45)) for x in cor)
        self.pintar(v * 0.5 * opacidade, clara)

    def caule(self, pontos, cor, largura, opacidade):
        m = borrar(self.mascara(linha=pontos, largura=largura), 1.2)
        self.pintar(m * opacidade * self.papel, cor)

    def imagem(self) -> Image.Image:
        rgba = np.dstack([self.cor, self.alfa])
        return Image.fromarray(np.clip(rgba * 255, 0, 255).astype(np.uint8), 'RGBA')


def ramo(w, h, semente, paleta, p0, p1, p2, p3, folhas, comp_max, opac=1.0, larg_caule=8):
    rng_np = np.random.default_rng(semente)
    rng = random.Random(semente)
    t_ = Tela(w, h, rng_np)
    pontos = [bezier(p0, p1, p2, p3, i / 60) for i in range(61)]
    t_.caule(pontos, paleta[0], larg_caule, 0.75 * opac)

    lado = 1
    for i in range(folhas):
        t = 0.12 + 0.86 * (i / max(1, folhas - 1))
        base = bezier(p0, p1, p2, p3, t)
        ang_caule = tangente(p0, p1, p2, p3, t)
        ultima = i == folhas - 1
        abertura = 0 if ultima else lado * math.radians(rng.uniform(38, 58))
        ang = ang_caule + abertura
        # Folhas menores perto da ponta, como no mockup.
        comp = comp_max * (1.0 - 0.45 * t) * rng.uniform(0.85, 1.1)
        larg = comp * rng.uniform(0.2, 0.26)
        contorno, nervura = contorno_da_folha(base, ang, comp, larg, lado * rng.uniform(0.2, 0.6), rng)
        cor = paleta[rng.randrange(len(paleta))]
        cor = tuple(int(min(255, max(0, c + rng.uniform(-10, 10)))) for c in cor)
        t_.folha(contorno, nervura, cor, opac * rng.uniform(0.75, 1.0))
        lado = -lado
    return t_.imagem()


def gerar(saida: str) -> dict[str, Image.Image]:
    os.makedirs(saida, exist_ok=True)
    ramos = {
        # Alto e reto: sobe pela lateral.
        'ramo-a': ramo(900, 1400, 11, VERDES, (450, 1390), (380, 1000), (560, 500), (430, 40), 11, 380),
        # Curvado: entra de lado e se abre.
        'ramo-b': ramo(1000, 1100, 23, VERDES, (40, 1060), (300, 900), (520, 420), (900, 120), 9, 370),
        # Pequeno: preenche entre os grandes.
        'ramo-c': ramo(620, 820, 37, VERDES, (300, 810), (250, 560), (380, 300), (310, 30), 7, 230),
        # Claro, para dentro dos cartoes coloridos.
        'ramo-canto': ramo(760, 760, 41, CLAROS, (740, 740), (560, 600), (430, 330), (110, 60), 8, 240, opac=0.85),
    }
    for nome, img in ramos.items():
        caminho = os.path.join(saida, f'{nome}.png')
        # RGBA cheio: quantizar posterizava a aguada em manchas.
        # 75%: ~2x da maior largura em que o ramo aparece na tela; o resto era peso.
        final = img.resize((img.size[0] * 3 // 4, img.size[1] * 3 // 4), Image.LANCZOS)
        final.save(caminho, optimize=True)
        img = final
        print(f'{nome}.png  {img.size[0]}x{img.size[1]}  {os.path.getsize(caminho) // 1024} KB')
    return ramos


# Previa --------------------------------------------------------------------

# Posicoes do arranjo 'home', em FRACAO da tela (iguais as do ScreenBackground).
ARRANJO_HOME = [
    # (ramo, left, top, largura, rotacao_graus, espelhar)
    ('ramo-a', -0.16, -0.02, 0.42, 8, False),
    ('ramo-b', 0.70, 0.05, 0.45, -10, True),
    ('ramo-c', -0.14, 0.40, 0.34, 15, False),
    ('ramo-a', 0.74, 0.46, 0.38, -6, True),
    ('ramo-b', -0.20, 0.72, 0.46, 4, False),
    ('ramo-c', 0.80, 0.80, 0.30, -12, True),
]


def luminancia(rgb):
    def canal(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (canal(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def previa(ramos, arquivo, opacidade_cartao):
    W, H = 1080, 2340
    fundo = Image.new('RGB', (W, H))
    paradas = [hex_rgb(c) for c in ('#96A06A', '#ABAE78', '#E2DDB9')]
    px = fundo.load()
    for y in range(H):
        t = y / (H - 1) * (len(paradas) - 1)
        i = min(int(t), len(paradas) - 2)
        f = t - i
        c = tuple(int(paradas[i][k] * (1 - f) + paradas[i + 1][k] * f) for k in range(3))
        for x in range(W):
            px[x, y] = c
    tela = fundo.convert('RGBA')
    for nome, left, top, larg, rot, espelhar in ARRANJO_HOME:
        img = ramos[nome]
        if espelhar:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        w = int(W * larg)
        img = img.resize((w, int(img.size[1] * w / img.size[0])), Image.LANCZOS).rotate(rot, expand=True, resample=Image.BICUBIC)
        tela.alpha_composite(img, (int(W * left), int(H * top)))

    creme = hex_rgb('#F8F3DE')
    camada = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(camada)
    a = int(255 * opacidade_cartao)
    m = 48
    # Cabecalho e cartoes creme (posicoes da Home real).
    for y0, y1 in ((150, 640), (1420, 1640), (1690, 1910)):
        d.rounded_rectangle((m, y0, W - m, y1), radius=48, fill=(*creme, a), outline=(255, 255, 255, 140), width=2)
    tela.alpha_composite(camada)

    # Cartoes coloridos com o ramo claro dentro.
    for y0, y1 in ((680, 1060), (1100, 1370)):
        grad = Image.new('RGBA', (W - 2 * m, y1 - y0))
        gp = grad.load()
        c0, c1 = hex_rgb('#B77C32'), hex_rgb('#49623A')
        for x in range(grad.size[0]):
            f = x / grad.size[0]
            c = tuple(int(c0[k] * (1 - f) + c1[k] * f) for k in range(3))
            for y in range(grad.size[1]):
                gp[x, y] = (*c, 255)
        canto = ramos['ramo-canto']
        s = int(grad.size[1] * 1.05)
        canto = canto.resize((s, s), Image.LANCZOS)
        canto.putalpha(canto.getchannel('A').point(lambda v: int(v * 0.4)))
        grad.alpha_composite(canto, (grad.size[0] - int(s * 0.8), -int(s * 0.15)))
        mascara = Image.new('L', grad.size, 0)
        ImageDraw.Draw(mascara).rounded_rectangle((0, 0, *grad.size), radius=48, fill=255)
        tela.paste(grad, (m, y0), mascara)

    # Barras de texto, so para ver o contraste a olho.
    d2 = ImageDraw.Draw(tela)
    for y in (230, 300, 1460, 1520, 1730, 1790):
        d2.rounded_rectangle((m + 50, y, m + 600, y + 34), radius=8, fill=(*hex_rgb('#39432C'), 255))
    tela.convert('RGB').save(arquivo, quality=90)

    # Pior caso: folha mais escura, opaca, atras do cartao.
    pior = min(VERDES, key=luminancia)
    fundo_efetivo = tuple(creme[k] * opacidade_cartao + pior[k] * (1 - opacidade_cartao) for k in range(3))
    for nome, cor in (('textPrimary', '#39432C'), ('textSecondary', '#5A6449'), ('sectionTitle', '#2E4D30')):
        print(f'contraste {nome} sobre cartao (pior caso, opacidade {opacidade_cartao}): '
              f'{contraste(hex_rgb(cor), fundo_efetivo):.2f}:1')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('saida')
    ap.add_argument('--previa')
    ap.add_argument('--opacidade', type=float, default=0.85)
    args = ap.parse_args()
    r = gerar(args.saida)
    if args.previa:
        previa(r, args.previa, args.opacidade)
