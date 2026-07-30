"""
Generate three candidate launcher-icon designs side-by-side at 192x192 each
so the user can pick which one to commit to.
  - Option 1: full wordmark padded to square on white  (the "crushed" baseline)
  - Option 2: stylized "ז/ל" big letter on cream + forest/clay accent
  - Option 3: monogram "ZL" on forest with cream letters
Output: public/icon-options.png  (576x192, three icons across)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / 'public' / 'icon-options.png'

def get_font(size, bold=False, italic=False):
    cands = [
        r'C:\Windows\Fonts\seguibl.ttf' if bold else r'C:\Windows\Fonts\segoeui.ttf',
        r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf',
    ]
    for c in cands:
        try: return ImageFont.truetype(c, size)
        except Exception: pass
    return ImageFont.load_default()

def round_corners(im, r_frac=0.18):
    w, h = im.size
    r = int(min(w, h) * r_frac)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=r, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), im if im.mode == 'RGBA' else None)
    out.putalpha(mask)
    return out

S = 192
strip = Image.new('RGB', (S * 3, S), (240, 240, 240))

# --- Option 1: wordmark padded to square ---
o1 = Image.new('RGBA', (S, S), (255, 255, 255, 255))
wm = Image.open(ROOT / 'public' / 'zlz-logo-wordmark.png').convert('RGBA')
inner = int(S * 0.86)
wmh = int(inner * wm.height / wm.width)
wm_fit = wm.resize((inner, wmh), Image.LANCZOS)
o1.paste(wm_fit, ((S - inner) // 2, (S - wmh) // 2), wm_fit)
strip.paste(round_corners(o1), (0, 0), round_corners(o1))

# --- Option 2: big Hebrew "ל" on cream with forest/clay color ---
o2 = Image.new('RGBA', (S, S), (250, 245, 236, 255))   # cream
d2 = ImageDraw.Draw(o2)
d2.text((S // 2, S // 2 + 4), 'ל',
        fill=(44, 90, 59),
        font=get_font(int(S * 0.85), bold=True),
        anchor='mm')
# orange underline flourish
d2.rounded_rectangle((S * 0.18, S * 0.78, S * 0.82, S * 0.84),
                      radius=int(S * 0.03), fill=(210, 122, 76))
strip.paste(round_corners(o2), (S, 0), round_corners(o2))

# --- Option 3: ZL monogram on forest ---
o3 = Image.new('RGBA', (S, S), (44, 90, 59, 255))      # forest
d3 = ImageDraw.Draw(o3)
d3.text((S // 2, S // 2 + 4), 'ZL',
        fill=(250, 245, 236),
        font=get_font(int(S * 0.55), bold=True),
        anchor='mm')
strip.paste(round_corners(o3), (S * 2, 0), round_corners(o3))

strip.save(OUT, 'PNG', optimize=True)
print('wrote', OUT)
