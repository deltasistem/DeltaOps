import fitz
doc = fitz.open("attached_assets/Delta_Brandbook_(1)_1785786071087.pdf")
print("pages:", doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2,2))
    pix.save(f".agents/outputs/brandbook/page-{i+1:02d}.png")
print("done")
