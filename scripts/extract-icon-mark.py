"""
Extract the central glyph from the official Zeh L'Zeh wordmark and save it
as a square icon-mark suitable for launcher icons.

Source: public/zlz-logo-wordmark.png (500x346 wordmark, transparent bg)
Output: public/zlz-icon-mark.png (1024x1024 square, white bg)

Strategy: crop the middle band that contains the large "זה לזה" Hebrew
script + orange flourish, dropping the small wraparound text at top and
bottom. Pad to square with white. Upscale to 1024 so downstream icon
generation has plenty of resolution.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'public' / 'zlz-logo-wordmark.png'
OUT  = ROOT / 'public' / 'zlz-icon-mark.png'

wm = Image.open(SRC).convert('RGBA')
W, H = wm.size                    # 500 x 346

# Crop bounds for the central script. Tuned to keep the bold script visible
# and chop the small wraparound English/Hebrew text rings.
x0, x1 = int(W * 0.16), int(W * 0.86)   # 80..430
y0, y1 = int(H * 0.18), int(H * 0.78)   # 62..270
cropped = wm.crop((x0, y0, x1, y1))     # ≈ 350 x 208

# Auto-trim further by alpha bbox so margins are tight.
bbox = cropped.getbbox()
if bbox: cropped = cropped.crop(bbox)
cw, ch = cropped.size

# Pad to square (centered) on white.
side = max(cw, ch) + max(cw, ch) // 6   # +16% padding
canvas = Image.new('RGBA', (side, side), (255, 255, 255, 255))
canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)

# Upscale to 1024x1024 so launcher-icon generation has headroom.
canvas = canvas.resize((1024, 1024), Image.LANCZOS)
canvas.convert('RGB').save(OUT, 'PNG', optimize=True)
print('wrote', OUT, 'size', canvas.size)
