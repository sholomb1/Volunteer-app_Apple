"""
Generate the Play Store graphic assets that are mandatory:
  - 512x512 PNG high-res app icon
  - 1024x500 PNG feature graphic (banner)

  py scripts/gen-playstore-assets.py public/zlz-source.png

Output: into a /playstore folder next to the source.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC  = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'public' / 'zlz-source.png')
OUT  = ROOT / 'playstore'
OUT.mkdir(parents=True, exist_ok=True)

logo = Image.open(SRC).convert('RGBA')

# 512x512 high-res icon (white background, logo padded a touch)
size = 512
pad  = int(size * 0.08)
canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
fit = logo.resize((size - 2 * pad, size - 2 * pad), Image.LANCZOS)
canvas.paste(fit, (pad, pad), fit)
canvas.convert('RGB').save(OUT / 'icon-512.png', 'PNG', optimize=True)
print('wrote', OUT / 'icon-512.png')

# 1024x500 feature graphic — warm cream background, official wordmark on the
# left, tagline on the right. Cream matches the rescue-app design token --cream.
fw, fh = 1024, 500
fg = Image.new('RGB', (fw, fh), (250, 245, 236))  # --cream
draw = ImageDraw.Draw(fg)

# Wordmark (Logo-Zeh-Lzeh-New-1.png) preserves its aspect ratio. Logo is
# 500x346 ≈ 1.45:1. Render at 580px wide → 401px tall, centered vertically,
# left-aligned with comfortable margin.
WORDMARK = ROOT / 'public' / 'zlz-logo-wordmark.png'
if WORDMARK.exists():
    wm = Image.open(WORDMARK).convert('RGBA')
    target_w = 580
    target_h = int(target_w * wm.height / wm.width)
    wm_fit = wm.resize((target_w, target_h), Image.LANCZOS)
    fg.paste(wm_fit, (60, (fh - target_h) // 2), wm_fit)

def get_font(size, bold=False):
    candidates = [
        r'C:\Windows\Fonts\seguibl.ttf' if bold else r'C:\Windows\Fonts\segoeui.ttf',
        r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf',
    ]
    for c in candidates:
        try: return ImageFont.truetype(c, size)
        except Exception: pass
    return ImageFont.load_default()

# Tagline on the right, deep-forest text on the cream.
text_x = 700
draw.text((text_x, 195), "Volunteer",                  fill=(44, 90, 59), font=get_font(54, bold=True))
draw.text((text_x, 268), "Rescue food.",               fill=(70, 70, 70), font=get_font(28))
draw.text((text_x, 305), "Help families.",             fill=(70, 70, 70), font=get_font(28))

fg.save(OUT / 'feature-graphic-1024x500.png', 'PNG', optimize=True)
print('wrote', OUT / 'feature-graphic-1024x500.png')
