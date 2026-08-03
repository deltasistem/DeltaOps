from PIL import Image
import os

ISO = Image.open("brand/logo/isotipo-color.png").convert("RGBA")
OCEANO = (8, 10, 22, 255)   # #080A16 (Brandbook)

def fit(img, size, pad_ratio):
    w = int(size * (1 - 2 * pad_ratio))
    r = min(w / img.width, w / img.height)
    return img.resize((int(img.width * r), int(img.height * r)), Image.LANCZOS)

def icon(size, bg=None, pad=0.18):
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    it = fit(ISO, size, pad)
    canvas.paste(it, ((size - it.width) // 2, (size - it.height) // 2), it)
    return canvas

os.makedirs("brand/favicon", exist_ok=True)
os.makedirs("brand/app-icons", exist_ok=True)
os.makedirs("brand/splash", exist_ok=True)

# Favicons (isotipo oficial sobre transparente)
for s in (16, 32, 48, 180):
    icon(s, pad=0.06).save(f"brand/favicon/favicon-{s}.png")
icon(32, pad=0.06).save("brand/favicon/favicon.ico", sizes=[(16,16),(32,32),(48,48)])

# App icons PWA (isotipo sobre Oceano, variante oficial "isotipo secundario")
for s in (192, 512):
    icon(s, bg=OCEANO).save(f"brand/app-icons/icon-{s}.png")
icon(512, bg=OCEANO, pad=0.28).save("brand/app-icons/icon-512-maskable.png")

# Splash (Oceano + isotipo centrado)
for w, h, name in ((1920, 1080, "splash-desktop"), (1080, 1920, "splash-mobile")):
    canvas = Image.new("RGBA", (w, h), OCEANO)
    it = fit(ISO, min(w, h), 0.38)
    canvas.paste(it, ((w - it.width) // 2, (h - it.height) // 2), it)
    canvas.convert("RGB").save(f"brand/splash/{name}.png")

print("ok")
