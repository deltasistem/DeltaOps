import fitz, os
doc = fitz.open("attached_assets/Delta_Brandbook_(1)_1785786071087.pdf")
out = ".agents/outputs/brand-embedded"
os.makedirs(out, exist_ok=True)
seen = set()
for pno in range(doc.page_count):
    for img in doc[pno].get_images(full=True):
        xref = img[0]
        if xref in seen: continue
        seen.add(xref)
        d = doc.extract_image(xref)
        with open(f"{out}/p{pno+1:02d}-x{xref}.{d['ext']}", "wb") as f:
            f.write(d["image"])
print(sorted(os.listdir(out)))
