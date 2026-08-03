# Análisis normativo del Brandbook DELTA (previo a DGP-005)

Documento obligatorio previo a cualquier componente visual. Fuentes de
autoridad: **Brandbook Oficial** (`attached_assets/Delta_Brandbook_(1)_1785786071087.pdf`,
10 páginas) y **Logo Oficial** (`attached_assets/Logo__Full_color-Negro_1785786066031.png`).

## 1. Elementos extraídos automáticamente del Brandbook

**Paleta cromática oficial (pág. 5–6, valores exactos):**

| Nombre oficial | Rol (pág. 6) | HEX | RGB | CMYK |
| --- | --- | --- | --- | --- |
| Blanco | Secundario Positivo | `#FFFFFF` | 255,255,255 | 0,0,0,0 |
| Rojo | Principal Positivo | `#D2002B` | 210,0,43 | 0,98,84,0 |
| Rojo Oscuro | Secundario Positivo | `#BA0C2F` | 186,12,47 | 14,99,85,0 |
| Azul Oscuro "Oceano" | Principal Negativo | `#080A16` | 8,10,22 | 88,87,69,73 |
| Negro | Secundario Negativo | `#000000` | 0,0,0 | 100,100,100,100 |
| Rojo (Opacidad 50%) | Terciario Positivo | `#D2002B` @ 50% | — | — |
| Rojo (Opacidad 20%) | Terciario Positivo | `#D2002B` @ 20% | — | — |

**Tipografía institucional (pág. 4):** Principal **Montserrat** (títulos);
Secundaria **Roboto** (títulos, subtítulos y textos). Confirmado además por la
directiva DGP-005. Ninguna otra tipografía permitida.

**Logotipo (pág. 2–3):** dos partes — Isotipo (letra inicial "D") + parte
tipográfica "ELTA" en Montserrat. Razones sociales en mayúsculas Montserrat.

**Área de reserva (pág. 3):** definida por la contraforma interna de la "A"
mayúscula, tomando su anchura como medida.

**Tamaños mínimos digitales (pág. 3):** Imagotipo 90px de ancho; Isotipo 20px
de ancho.

**Usos correctos (pág. 7):** isotipos secundarios en contenedor redondeado
(Oceano/rojo/borde), logo principal claro (isotipo rojo + texto negro), logo
sobre pastilla oscura, logos secundarios monocromos (negro, rojo, blanco sobre
rojo).

**Usos incorrectos (pág. 8):** prohibidos cambios de orientación, tipografía,
color, contornos, superposición de elementos y deformaciones.

## 2. Elementos que requirieron interpretación humana

- **Tintes de rojo**: el Brandbook define "Rojo 50%" y "Rojo 20%" como
  opacidades; se materializan como tokens de color con alfa sobre el rojo
  oficial (no colores nuevos).
- **Derivación de recursos digitales**: favicon, app-icons y splash se derivan
  del **isotipo recortado del archivo oficial** (sin alterar la forma) sobre
  fondos oficiales (transparente u Oceano), siguiendo el patrón de "isotipos
  secundarios" de la pág. 7.
- **Logo para fondos oscuros**: extraído del propio Brandbook (pág. 10,
  logotipo blanco) mediante recorte del PDF oficial y transparencia del fondo
  rojo corporativo. No se recreó ni redibujó ninguna forma.

## 3. Información NO existente en el Brandbook

El Brandbook no define: escala de grises, colores semánticos
(éxito/advertencia/error/informativo), superficies, bordes, elevaciones,
sombras, radios, espaciados, sistema de grillas, escalas y pesos tipográficos
numéricos, tracking, iconografía de producto, animaciones y sus timings,
breakpoints, estados de componentes ni tokens de modo oscuro.

## 4. Decisiones conservadoras adoptadas (con trazabilidad)

Todas documentadas también en `brand/tokens/tokens.json` (campo `origen`):

- **Escala de grises**: derivada por mezcla matemática entre Blanco y Oceano
  (los dos extremos oficiales), sin introducir matices ajenos.
- **Colores semánticos**: error = Rojo oficial `#D2002B` (único rojo
  permitido); éxito/advertencia/info toman tonos neutrales de la industria
  ajustados a contraste AA como texto sobre fondo claro (`#15803D`,
  `#A16207`, `#1D4ED8`), declarados como *no-brandbook* y usados
  exclusivamente en feedback de estado (nunca en identidad de marca). En el
  tema oscuro se aclaran mediante mezcla matemática con el Blanco oficial
  (`color-mix`), siguiendo el mismo criterio de derivación que la escala de
  grises. El texto de error sobre fondos oscuros usa `errorTexto` (Rojo
  oficial mezclado con Blanco) para alcanzar AA sin introducir rojos ajenos.
- **Tipografía**: escala modular estándar (12–36px), pesos existentes en las
  familias oficiales (400/500/600/700), tracking 0 (por defecto de las
  fuentes) y `+0.05em` solo para etiquetas uppercase.
- **Radios/espaciados/sombras/z-index/breakpoints/motion**: escalas estándar
  conservadoras (4px base; breakpoints 640/768/1024/1280; animaciones
  150–300ms ease-out), declaradas como no-brandbook.
- **Modo oscuro**: el Brandbook define pareja Positivo/Negativo
  (Blanco↔Oceano); el tema oscuro usa Oceano como fondo y Blanco como texto,
  con los mismos acentos rojos oficiales.
- **Iconografía**: familia única `lucide` (trazo uniforme 2px, ya usada por la
  plataforma), cumpliendo la regla de un solo estilo; el Brandbook no define
  iconos de producto.
- **Fuentes**: Montserrat y Roboto se instalan como paquetes de fuentes
  (`@fontsource`), origen oficial de las familias indicadas.
