---
name: Panel GDG ICA
description: Carta celeste de la comunidad; el panel admin donde cada cosa tiene coordenadas y su importancia se lee como magnitud.
colors:
  atlas-night: "#0a1021"
  atlas-deep: "#16233d"
  atlas-chart: "#24374f"
  atlas-line: "#2e4262"
  atlas-fog: "#8a93a6"
  atlas-mist: "#b8bfcc"
  atlas-dust: "#f2f2e9"
  atlas-star: "#ff4d2e"
  atlas-ember: "#d1361a"
  atlas-ember-deep: "#b02c14"
  atlas-glow: "#ffb36b"
  atlas-ok: "#6fcf97"
  atlas-rose: "#ff8a9a"
typography:
  display:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 640
    lineHeight: 1.05
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  headline:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 640
    lineHeight: 1
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  title:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 640
    lineHeight: 1.4
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  body:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 102"
  body-sm:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 112"
  numeral:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum' 1"
rounded:
  xs: "2px"
  md: "6px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.atlas-ember}"
    textColor: "#ffffff"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.atlas-ember-deep}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.atlas-dust}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.atlas-deep}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.atlas-mist}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.atlas-mist}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  nav-item-active:
    backgroundColor: "{colors.atlas-deep}"
    textColor: "{colors.atlas-dust}"
  chart-panel:
    backgroundColor: "{colors.atlas-night}"
    rounded: "{rounded.xs}"
    padding: "12px 20px"
  error-state:
    textColor: "{colors.atlas-dust}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  sidebar:
    backgroundColor: "{colors.atlas-night}"
    width: "248px"
---

# Design System: Panel GDG ICA

Alcance: este sistema rige **solo el panel admin (`/admin/*`)**, montado por `src/layouts/AdminLayout.astro` con la clase `admin-atlas` en `<body>`. El sitio público (`src/layouts/Layout.astro` y sus páginas, Geist y los colores Google) conserva su propio aspecto y queda fuera de este documento.

## Overview

**Creative North Star: "La carta celeste de la comunidad"**

El panel es un atlas estelar nocturno. Cada cosa tiene coordenadas (fecha, alcance, rol, estado) y su importancia se lee como magnitud: el tamaño del punto, el brillo del número, el ámbar que solo aparece donde algo te necesita. Rechaza el admin gris de tarjetas blancas con un acento azul. La superficie es noche plana en capas de índigo, trazada con filetes de un píxel que terminan en nodos rotados, como las líneas de una carta impresa.

La densidad es de herramienta de trabajo, no de tablero: una sola columna de contenido bajo una cabecera que dice dónde estás y qué alcance tienes, con un riel de navegación agrupado a la izquierda. Los nombres propios (eventos, la comunidad, títulos de página) se escriben en el corte ancho seminegrita de Archivo (`.atlas-name`); lo operativo, en la misma grotesca a ancho normal; las etiquetas, en versalitas espaciadas; las cifras, tabulares. Existe un segundo modo, **evento en vivo**, que cambia la cabecera a índigo, muestra el estado de sincronización en la línea de coordenadas y, en el celular, añade una barra de pestañas inferior.

Solo noche: no hay variante clara (`color-scheme: dark`). Sin brillos ni degradados decorativos.

**Key Characteristics:**

- Noche plana en tres capas (noche, índigo, azul carta) separadas por filetes de 1px, no por sombras.
- Un único acento cálido, ámbar estelar, reservado para la acción principal, el foco y lo pendiente.
- Retícula de localización (anillo con cruz) como marca del elemento activo, seleccionado o tuyo.
- Magnitud: rampa fija de tamaños de punto para la importancia de un evento.
- Una sola familia, Archivo Variable: corte ancho seminegrita para nombres, ancho normal para todo lo demás, versalitas para etiquetas.

## Colors

Paleta nocturna de un solo acento: neutros fríos de tinta azul y un ámbar rojizo que se gasta poco.

### Primary

- **Ámbar estelar** (`atlas-star`): el color de lo que te necesita. Retícula activa, anillo de foco (`:focus-visible:not([tabindex="-1"])`, 2px, separación 2px; el `<main tabindex="-1">` que recibe foco programático no lo muestra), conteos de pendientes en el riel y en «Te esperan», la línea y etiqueta «Hoy» de la efeméride, el punto «En vivo», el subrayado de la pestaña activa del modo evento, el cursor de texto y la selección (al 35%). Nunca relleno de superficies grandes.
- **Ascua** (`atlas-ember`): relleno del botón primario y del enlace «Saltar al contenido». Es el ámbar estelar oscurecido para que el texto blanco sea legible sobre él.
- **Ascua profunda** (`atlas-ember-deep`): hover del botón primario. Variable `--color-atlas-ember-deep`, utilidad `hover:bg-atlas-ember-deep`.

### Secondary

- **Ámbar claro** (`atlas-glow`): anotaciones. Encabezados de grupo del riel, leyenda de la efeméride, «Más secciones», «Editando», el aviso de vista previa local y el estado «En vivo» y «Sin conexión» de la línea de coordenadas.

### Tertiary

- **Verde sincronía** (`atlas-ok`): solo el estado «Sincronizado» del modo evento.
- **Rosa error** (`atlas-rose`): estado de error (borde al 40%, fondo al 5%) y «No se pudo contar».

### Neutral

- **Noche** (`atlas-night`): fondo de página, riel, cabecera en modo gestión y el relleno de los nodos.
- **Índigo** (`atlas-deep`): segunda capa. Ítem activo del riel, hover de filas y botones secundarios (al 60% en filas), cabecera en modo evento, panel de la efeméride (al 40%).
- **Azul carta** (`atlas-chart`): tercera capa del mundo; token definido y disponible para superficies anidadas.
- **Filete** (`atlas-line`): todos los bordes y reglas de 1px, retícula en reposo-hover, la barra de desplazamiento.
- **Velo** (`atlas-fog`): texto terciario. Subtítulos, fechas, meses del gráfico, placeholders, flechas en reposo.
- **Bruma** (`atlas-mist`): texto secundario y enlaces de navegación en reposo; valores resaltados dentro de la línea de coordenadas.
- **Polvo de estrellas** (`atlas-dust`): texto principal y los puntos de magnitud.

### Named Rules

**The Una Sola Estrella Rule.** El ámbar estelar y su ascua marcan una sola cosa por zona: la acción principal de la cabecera, el elemento activo, lo pendiente. Si dos botones primarios compiten en la misma fila, uno de los dos es secundario. En «Tus eventos», «Abrir check-in» solo es primario el día del evento.

**The Puente Transitorio Rule.** Dentro de `.admin-atlas`, `src/styles/admin.css` reasigna las escalas `gray`, `blue`, `red`, `green`, `amber` y `yellow` de Tailwind a valores del mundo (`blue-*` pasa a la rampa ascua, `gray-*` a la tinta nocturna) para que las secciones aún no migradas no rompan la noche. Es un mecanismo de transición, no la paleta: el código nuevo usa solo tokens `atlas-*`, y el puente se retira cuando la última sección migre. No se citan sus valores como colores del sistema.

## Typography

**Display Font:** Archivo Variable, peso 640, ancho 118%, tracking −0.015em, recta (con sans-serif), vía la clase `.atlas-name`
**Body Font:** Archivo Variable, ancho 102% (con sans-serif)
**Label Font:** Archivo Variable, ancho 112%, versalitas

**Character:** Una sola familia variable hace todo el trabajo y la jerarquía sale de sus ejes: los nombres propios se abren a un corte ancho y seminegro, apretado de tracking, como los rótulos de una carta impresa; lo operativo queda a ancho casi normal. Sin itálicas. Autoalojada con `@fontsource-variable/archivo` (eje `wdth`); el token es `--font-atlas`.

### Hierarchy

- **Display** (`.atlas-name`, 36px desde `sm` / 28px en celular, interlínea 1.05): título de página en la cabecera, saludo del dashboard, nombre del evento en modo vivo. En la pantalla de inicio de sesión sube a 44px (36px en las pantallas de estado de acceso; 30px en «sin alcance»).
- **Headline** (`.atlas-name`, 22px, interlínea 1): encabezado de sección (`SectionHeading`), seguido de un filete con nodo.
- **Title** (`.atlas-name`, 20px): nombre de evento en una fila; 17px en las etiquetas de la efeméride; 22px para «GDG ICA» en el riel.
- **Body** (400, 15px): navegación del riel, filas de «Te esperan», texto introductorio. **Body-sm** (14px) para la línea de coordenadas, metadatos y botones.
- **Label** (600, 11px, tracking 0.14em, mayúsculas, ancho 112%): encabezados de grupo del riel, leyenda de gráficos, meses, «Hoy», día-mes bajo una cifra.
- **Numeral** (600, 32px día de fecha / 28px conteo pendiente, interlínea 1, cifras tabulares): la magnitud tipográfica de un dato.

### Named Rules

**The Nombre Propio Rule.** El corte ancho seminegrita (`.atlas-name`: 640, ancho 118%) está reservado para nombres y títulos: de página, de sección, de evento, de la comunidad, la inicial del avatar, los títulos de login y avisos. Nunca para botones, etiquetas, cifras o texto corrido.

**The Cifra Tabular Rule.** Tablas, `<time>` y todo número que se compara usan cifras tabulares (`.tabular`, ya aplicado por defecto a `table` y `time`).

## Layout

Dos columnas a nivel de aplicación: riel fijo de 248px (desde `lg`, 1024px) y columna principal con su propio desplazamiento; la ventana completa no se desplaza (`h-screen overflow-hidden`). Bajo `lg`, el riel se vuelve un cajón modal de `min(86vw, 300px)` con velo noche al 80%, trampa de foco y cierre con Escape.

La cabecera tiene título display, línea de coordenadas debajo (rol, alcance, próximo evento; o estado en vivo, herramienta, fecha y lugar) y un hueco de acciones a la derecha (`#admin-header-actions`, llenado por portal con `HeaderActions`). En celular las acciones bajan a su propia fila, alineadas con el título. La cabecera se cierra con un filete con nodo que se apoya en el borde del riel.

Ritmo: márgenes de página 32px (16px en celular), 40px entre secciones, 16px de alto en filas de lista, 20px de relleno lateral en paneles. El contenido del dashboard se limita a 1152px (`max-w-6xl`) y se divide en 1.6 : 1 desde `lg` («Tus eventos» y «Te esperan»). Las pantallas de acceso y login son una sola columna de 448px centrada.

En modo evento, en celular, una barra de pestañas fija inferior (alto mínimo 56px, respeta `safe-area-inset-bottom`) reemplaza a las pestañas de la cabecera, y el contenido reserva 96px abajo.

## Elevation & Depth

Plano. No hay `box-shadow` en el sistema. La profundidad se construye con capas tonales (noche, índigo al 40/60/100%, azul carta) y con filetes de 1px en `atlas-line`. El único velo es el del cajón móvil (noche al 80%). El riel usa una máscara de desplazamiento (de noche a transparente, 56px) con la anotación «Más secciones» cuando queda contenido abajo; es una señal funcional, no un degradado decorativo.

### Named Rules

**The Tinta Plana Rule.** Nada flota. Si una superficie necesita separarse, sube una capa tonal o gana un filete; nunca una sombra ni un brillo.

## Shapes

Geometría de carta: rectángulos casi rectos, líneas de un píxel y nodos en rombo.

- **Paneles de carta** (efeméride, lista «Te esperan», estado vacío punteado): esquina casi recta (2px), borde de 1px, y `CornerNodes` en las cuatro esquinas: rombos de 6px con borde ámbar estelar al 70% y relleno noche, centrados sobre el vértice.
- **Controles** (botones, ítems del riel, estado de error, aviso): esquina suave (6px).
- **Avatares y puntos de magnitud**: círculo completo.
- **Filete con nodo** (`ChartRule`): un rombo de 6px seguido de una línea de 1px. Cierra la cabecera, acompaña cada encabezado de sección y separa título de texto en las pantallas de acceso. Los encabezados de grupo del riel usan la misma línea sin nodo.
- **Líneas de la efeméride**: horizontales al 40%, meses en filete discontinuo vertical, «Hoy» en filete ámbar estelar al 60%.

## Components

### Buttons

Rectos, firmes, sin ornamento.

- **Shape:** esquina suave (6px).
- **Primary:** relleno ascua, texto blanco, 600, 14px, relleno 10px 16px. Uno por zona.
- **Hover / Focus:** el primario baja a ascua profunda; el secundario aclara su borde a bruma y gana fondo índigo. Transición de color. Foco con el anillo global ámbar estelar.
- **Secondary:** sin relleno, borde filete, texto polvo.
- **Quiet:** sin borde, texto bruma que sube a polvo; para salidas como «Ver el sitio público».
- **Disabled:** opacidad 50%.
- **Inicio de sesión con Google:** botón de ancho completo, índigo con borde filete; el logotipo de Google conserva sus cuatro colores de marca porque es la marca del proveedor, no del panel.

### Cards / Containers

- **Corner Style:** 2px en paneles de carta, con nodos en las esquinas.
- **Background:** transparente o índigo al 40%.
- **Shadow Strategy:** ninguna (ver Elevation & Depth).
- **Border:** 1px filete; los separadores internos de filas, también.
- **Internal Padding:** 12px 20px en el pie de leyenda, 16px 20px en filas.

### Navigation

- **Riel:** marca (logo + «GDG ICA» en `.atlas-name` + «Panel de la comunidad»), grupos con etiqueta en versalitas ámbar claro y filete, ítems a 15px en bruma. Hover: fondo índigo al 60%, texto polvo, la retícula aparece en color filete. Activo: fondo índigo, texto polvo 600, retícula ámbar estelar que entra con `atlas-reticle-in`. Conteo de pendientes alineado a la derecha en ámbar estelar 12px tabular, con «pendientes» solo para lectores de pantalla. Pie con avatar, nombre, rol y cerrar sesión.
- **Pestañas del modo evento (escritorio):** texto 14px 600, subrayado de 2px ámbar estelar en la activa.
- **Barra inferior del modo evento (celular):** cuadrícula de iguales con icono de trazo de 20px y etiqueta de 12px; la activa cambia su icono por la retícula ámbar estelar.

### Inputs / Fields

Aún sin primitiva propia del mundo: los formularios de las secciones se ven en la noche a través del puente transitorio. Lo ya fijado de forma global: placeholder en velo, cursor de texto ámbar estelar, anillo de foco ámbar estelar.

### Retícula de localización (firma)

Anillo de 6.5 de radio con punto central y cuatro brazos, trazo 1.5 (`ReticleIcon`). Marca el ítem activo del riel, la pestaña activa en celular, el evento que es tuyo en la efeméride y, girando lento (2.4s), la carga (`LoadingState`). Entra con `atlas-reticle-in`: de escala 1.6 y −45° a su sitio en 420ms con `cubic-bezier(0.16, 1, 0.3, 1)`; desactivada con `prefers-reduced-motion`.

### Efeméride (firma)

Carta de fechas de los próximos 120 días: «Hoy» a la izquierda, meses como filetes discontinuos, eventos alternados en dos alturas (38% y 64%). Cada evento es un punto polvo cuyo diámetro sigue la rampa fija de magnitud por inscritos (6px sin inscritos, 9px desde 1, 13px desde 100, 18px desde 250), con nombre en `.atlas-name` 17px y fecha · inscritos en velo. La leyenda explica la rampa y la retícula. Ancho mínimo 640px con desplazamiento horizontal en celular.

### Fila de evento

Columna de fecha de 72px (cifra 32px + mes en etiqueta) separada por un filete vertical, nombre en `.atlas-name` 20px, metadatos en velo unidos con « · », y acciones secundarias a la derecha; la herramienta principal pasa a primaria solo el día del evento.

### Estados

- **Carga:** retícula girando + texto bruma 14px, `role="status"`.
- **Error:** caja rosa (borde 40%, fondo 5%), texto polvo, botón «Reintentar» secundario, `role="alert"`.
- **Vacío:** caja de borde discontinuo filete, texto bruma, que explica qué hacer.
- **Línea de sincronía (modo evento):** «· Sincronizado · 42/120 presentes ·» en verde sincronía, o ámbar claro sin conexión, dentro de la línea de coordenadas.

## Do's and Don'ts

### Do:

- **Do** usar solo tokens `atlas-*` en código nuevo del panel; el puente de `admin.css` es para lo no migrado.
- **Do** reservar el ámbar estelar y la ascua para la acción principal, el foco, lo activo y lo pendiente.
- **Do** escribir los nombres propios (página, sección, evento) con `.atlas-name` y todo lo demás en Archivo a ancho normal; una sola familia.
- **Do** separar superficies con capas tonales y filetes de 1px, y cerrar encabezados y paneles de carta con nodos en rombo.
- **Do** marcar lo activo, lo tuyo y lo que carga con la retícula de localización, y dar importancia con la rampa fija de magnitud (6 / 9 / 13 / 18px).
- **Do** usar cifras tabulares en tablas, fechas y conteos.
- **Do** dibujar los iconos como trazo de 1.5 en una caja de 24, heredando `currentColor`.

### Don't:

- **Don't** usar `box-shadow`, brillos ni degradados decorativos; la máscara de desplazamiento del riel es la única transición tonal.
- **Don't** añadir una variante clara: el panel es solo noche.
- **Don't** reintroducir el admin gris de tarjetas blancas con acento azul, ni los colores Google del sitio público dentro del panel (salvo el logotipo de Google en su botón).
- **Don't** usar `.atlas-name` en botones, etiquetas o cifras, ni reintroducir una segunda familia o itálicas.
- **Don't** usar emoji ni caracteres como iconos; los iconos son SVG de trazo.
- **Don't** mostrar slugs, uids o claves de permiso donde puede ir el nombre del evento o de la persona.
