"""
Generate Android launcher + PWA icons from a single 1024x1024 source PNG.

  py scripts/gen-icons.py public/zlz-source.png

Writes:
  - android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
      ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
  - public/icon-192.png, icon-512.png, icon-maskable.png, apple-touch-icon.png
"""
import sys, os
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC  = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'public' / 'zlz-source.png')

# Android launcher sizes (square + round)
ANDROID_SIZES = {
    'mdpi':    48,
    'hdpi':    72,
    'xhdpi':   96,
    'xxhdpi': 144,
    'xxxhdpi':192,
}
# Foreground for adaptive icons — Android renders only the inner 66dp of a
# 108dp canvas, so the foreground should leave generous padding.
FOREGROUND_SIZES = {k: int(v * 108 / 48) for k, v in ANDROID_SIZES.items()}

# Brand-matched icon background (warm forest from the design tokens). The
# adaptive-icon XML references @color/ic_launcher_background; we update that
# value separately, but using a matching color here keeps non-adaptive icons
# consistent on older Android.
BG = (255, 255, 255, 255)   # white — logo already has its color identity

def round_corners(im: Image.Image, radius_frac: float = 0.18) -> Image.Image:
    """Round corners by radius_frac of the side length (Android standard)."""
    w, h = im.size
    radius = int(min(w, h) * radius_frac)
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), im)
    out.putalpha(mask)
    return out

def circle(im: Image.Image) -> Image.Image:
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, w, h), fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), im)
    out.putalpha(mask)
    return out

def composite_on_bg(im: Image.Image, bg) -> Image.Image:
    """Paste the (transparent) logo onto a solid background."""
    base = Image.new('RGBA', im.size, bg)
    base.paste(im, (0, 0), im)
    return base

def fit_into(im: Image.Image, size: int, padding_frac: float = 0.10) -> Image.Image:
    """Center-fit the logo into a square of `size` with padding."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * padding_frac))
    resized = im.resize((inner, inner), Image.LANCZOS)
    canvas.paste(resized, ((size - inner) // 2, (size - inner) // 2), resized)
    return canvas

def main():
    if not SRC.exists():
        print(f'source not found: {SRC}', file=sys.stderr); sys.exit(1)
    logo = Image.open(SRC).convert('RGBA')

    # Android launcher icons
    for density, size in ANDROID_SIZES.items():
        out_dir = ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / f'mipmap-{density}'
        out_dir.mkdir(parents=True, exist_ok=True)

        # Square (rounded-corner) launcher icon: white bg + logo.
        sq = composite_on_bg(fit_into(logo, size, padding_frac=0.12), BG)
        round_corners(sq).save(out_dir / 'ic_launcher.png', 'PNG', optimize=True)

        # Round launcher icon (Android 7+).
        rd = composite_on_bg(fit_into(logo, size, padding_frac=0.12), BG)
        circle(rd).save(out_dir / 'ic_launcher_round.png', 'PNG', optimize=True)

        # Adaptive foreground — 108dp canvas, logo in inner 66dp area
        # (extra padding so cropping by the system mask doesn't clip the logo).
        fg_size = FOREGROUND_SIZES[density]
        fg = fit_into(logo, fg_size, padding_frac=0.27)
        fg.save(out_dir / 'ic_launcher_foreground.png', 'PNG', optimize=True)

    # PWA web icons
    pub = ROOT / 'public'
    pub.mkdir(exist_ok=True)
    composite_on_bg(fit_into(logo, 192, 0.10), BG).save(pub / 'icon-192.png',         'PNG', optimize=True)
    composite_on_bg(fit_into(logo, 512, 0.10), BG).save(pub / 'icon-512.png',         'PNG', optimize=True)
    # Maskable icons need much more safe-area padding (inner 80% only).
    composite_on_bg(fit_into(logo, 512, 0.20), BG).save(pub / 'icon-maskable.png',    'PNG', optimize=True)
    composite_on_bg(fit_into(logo, 180, 0.08), BG).save(pub / 'apple-touch-icon.png', 'PNG', optimize=True)
    # Favicon (browser tab).
    composite_on_bg(fit_into(logo, 32, 0.06), BG).save(pub / 'favicon.png', 'PNG', optimize=True)

    print('icons generated for android densities:', ', '.join(ANDROID_SIZES))
    print('PWA icons written to public/')

if __name__ == '__main__':
    main()
