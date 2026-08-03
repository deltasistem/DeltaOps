from PIL import Image
import fitz, os

OUT = "brand"
os.makedirs(f"{OUT}/logo", exist_ok=True)

# 1) Logo oficial (fuente: archivo entregado, sin modificación)
src = Image.open("attached_assets/Logo__Full_color-Negro_1785786066031.png").convert("RGBA")
print("logo oficial:", src.size)
src.save(f"{OUT}/logo/logo-color-negro.png")

# 2) Isotipo = recorte del archivo oficial (sin alterar la forma).
# Encontrar el hueco vertical entre isotipo y texto usando el canal alfa.
import numpy as np
a = np.array(src)[:, :, 3]
cols = a.max(axis=0)
# primera columna con contenido
xs = np.where(cols > 0)[0]
x0 = xs[0]
# buscar primer gap (>=10px sin contenido) después de x0
gap_start = None
run = 0
for x in range(x0, a.shape[1]):
    if cols[x] == 0:
        run += 1
        if run >= 10:
            gap_start = x - run + 1
            break
    else:
        run = 0
print("isotipo hasta x:", gap_start)
rows = a[:, x0:gap_start].max(axis=1)
ys = np.where(rows > 0)[0]
iso = src.crop((int(x0), int(ys[0]), int(gap_start), int(ys[-1]) + 1))
print("isotipo:", iso.size)
iso.save(f"{OUT}/logo/isotipo-color.png")

# 3) Logo blanco (fondo oscuro): recorte del Brandbook oficial pág. 10
doc = fitz.open("attached_assets/Delta_Brandbook_(1)_1785786071087.pdf")
page = doc[9]
zoom = 6
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=fitz.Rect(175, 120, 335, 185))
img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
arr = np.array(img).astype(int)
# el fondo es el rojo corporativo D2002B: distancia cromática -> alfa
red = np.array([0xD2, 0x00, 0x2B])
dist = np.sqrt(((arr[:, :, :3] - red) ** 2).sum(axis=2))
alpha = np.clip((dist - 20) / 60.0, 0, 1)  # cerca del rojo -> transparente
out = arr.copy()
out[:, :, 3] = (alpha * 255).astype(int)
# el isotipo del logo blanco ES rojo en pág.10? mirar: en pág 10 todo el logo es blanco.
white = Image.fromarray(out.astype("uint8"))
bbox = white.getchannel("A").getbbox()
white = white.crop(bbox)
print("logo blanco:", white.size)
white.save(f"{OUT}/logo/logo-blanco.png")
