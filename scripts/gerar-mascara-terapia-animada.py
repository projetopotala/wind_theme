"""Gera outputs/media/atendimentos-conceito/ambiente-viva-mascara.webp.

Mascara (cinza, 512x288) das folhas da planta alta da cena de terapia da Home. Usada por
outputs/js/home/terapia-animada.js: valor 0 = nao se move; valor alto = folhagem livre. A amplitude cresce
com a altura (base do vaso fica parada) e as bordas sao suaves, para o balanco nunca mover a planta em bloco.

Uso:  python scripts/gerar-mascara-terapia-animada.py            (precisa de Pillow, numpy e scipy)
A foto original (ambiente.webp) NAO e modificada.
"""
import numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage as ndi

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "outputs" / "media" / "atendimentos-conceito"

a = np.asarray(Image.open(PASTA / "ambiente.webp").convert("RGB")).astype(np.float32)
H, W, _ = a.shape  # 900 x 1600
r, g, b = a[..., 0], a[..., 1], a[..., 2]
verde = (g > r * 0.98) & (g > b * 1.12)
escuro = a.mean(-1) < 120
folha = (verde | (escuro & (g >= r * 0.9))).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
folha *= ((xx >= 1050) & (xx <= 1470) & (yy <= 395)).astype(np.float32)  # so a planta alta
folha = ndi.binary_closing(folha > 0, iterations=2).astype(np.float32)
folha = ndi.gaussian_filter(folha, 2.0)
amp = np.clip((372 - yy) / 250.0, 0, 1) ** 0.8  # base parada, topo livre
m = np.clip(folha * amp * 1.2, 0, 1)
Image.fromarray((m * 255).astype(np.uint8)).resize((512, 288), Image.LANCZOS).save(
    PASTA / "ambiente-viva-mascara.webp", quality=90, method=6
)
print("ok")
