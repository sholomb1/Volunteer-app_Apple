"""
Build a 1024x1024 square brand source from the wordmark for icon generation.
White background, wordmark centered with comfortable padding.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'public' / 'zlz-logo-wordmark.png'
OUT  = ROOT / 'public' / 'zlz-source.png'

wm = Image.open(SRC).convert('RGBA')
S = 1024
PAD = int(S * 0.08)
inner = S - 2 * PAD
ih = int(inner * wm.height / wm.width)
fit = wm.resize((inner, ih), Image.LANCZOS)

canvas = Image.new('RGBA', (S, S), (255, 255, 255, 255))
canvas.paste(fit, (PAD, (S - ih) // 2), fit)
canvas.convert('RGB').save(OUT, 'PNG', optimize=True)
print('wrote', OUT)
