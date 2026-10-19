---
name: GDG ICA
description: Dos mundos con alcance propio. El sitio público es la carretera a Ica, señalizada con paneles de destino; el panel admin es la carta celeste de la comunidad.
colors:
  sand: "#ead6ae"
  sand-deep: "#dcc08a"
  sand-pale: "#f5ead3"
  ink: "#202124"
  ink-muted: "#4d4436"
  ink-subtle: "#5c5040"
  line: "#c4ab7c"
  asphalt: "#202124"
  asphalt-soft: "#2d2e31"
  asphalt-muted: "#bdc1c6"
  post: "#9aa0a6"
  sign-white: "#ffffff"
  sign-green: "#188038"
  sign-green-deep: "#137333"
  sign-blue: "#1a73e8"
  sign-blue-deep: "#1967d2"
  sign-yellow: "#fbbc04"
  sign-yellow-deep: "#f9ab00"
  sign-red: "#d93025"
  sign-red-deep: "#c5221f"
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
  sign-display:
    fontFamily: "Overpass, sans-serif"
    fontSize: "clamp(2.75rem, 1.4rem + 4.6vw, 5.5rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.025em"
  sign-title:
    fontFamily: "Overpass, sans-serif"
    fontSize: "clamp(2rem, 1.3rem + 2.4vw, 3.25rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em"
  sign-station:
    fontFamily: "Overpass, sans-serif"
    fontSize: "clamp(1.75rem, 1.1rem + 1.9vw, 2.75rem)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.02em"
  sign-heading:
    fontFamily: "Overpass, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1vw, 2rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  sign-lede:
    fontFamily: "Overpass, sans-serif"
    fontSize: "clamp(1.125rem, 1rem + 0.45vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.45
  sign-body:
    fontFamily: "Overpass, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  sign-action:
    fontFamily: "Overpass, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.5
  sign-label:
    fontFamily: "Overpass, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    letterSpacing: "0.12em"
  plate-label:
    fontFamily: "Overpass, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
  plate-figure:
    fontFamily: "Overpass, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
  plate-figure-sm:
    fontFamily: "Overpass, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
  plate-figure-stat:
    fontFamily: "Overpass, sans-serif"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
  milestone-figure:
    fontFamily: "Overpass, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
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
  sign: "1.75rem"
  sign-inner: "1.125rem"
  plate: "0.625rem"
  plate-inner: "7px"
  tag: "6px"
  milestone: "6.5rem"
  xs: "2px"
  md: "6px"
  full: "9999px"
spacing:
  container-site: "82rem"
  site-gutter: "16px"
  site-gutter-md: "32px"
  sign-band: "0.625rem"
  station-y: "56px"
  station-y-md: "80px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
  section: "40px"
components:
  sign-arrow:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.sign-white}"
    height: "96px"
    width: "26rem"
  sign-arrow-hover:
    backgroundColor: "{colors.sign-blue-deep}"
  sign-button-solid:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.sign-white}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "10px 24px 8px"
  sign-button-solid-hover:
    backgroundColor: "{colors.sign-blue-deep}"
  sign-button-green:
    backgroundColor: "{colors.sign-green}"
    textColor: "{colors.sign-white}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "10px 24px 8px"
  sign-button-green-hover:
    backgroundColor: "{colors.sign-green-deep}"
  sign-button-yellow:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "10px 24px 8px"
  sign-button-yellow-hover:
    backgroundColor: "{colors.sign-yellow-deep}"
  sign-button-red:
    backgroundColor: "{colors.sign-red}"
    textColor: "{colors.sign-white}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "10px 24px 8px"
  sign-button-red-hover:
    backgroundColor: "{colors.sign-red-deep}"
  sign-button-outline:
    backgroundColor: "{colors.sign-white}"
    textColor: "{colors.ink}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "10px 24px 8px"
  sign-button-outline-hover:
    backgroundColor: "{colors.sand-pale}"
  sign-nav-item:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign-white}"
    typography: "{typography.sign-action}"
    rounded: "{rounded.plate}"
    padding: "6px 12px 4px"
  sign-nav-item-active:
    backgroundColor: "{colors.sign-green}"
  destination-panel:
    backgroundColor: "{colors.sign-green}"
    textColor: "{colors.sign-white}"
    rounded: "{rounded.sign}"
    padding: "{spacing.sign-band}"
  route-station:
    textColor: "{colors.sign-white}"
    rounded: "{rounded.sign}"
    padding: "{spacing.sign-band}"
  plate:
    backgroundColor: "{colors.sign-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "16px 20px 12px"
  plate-countdown:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
  milestone:
    backgroundColor: "{colors.sign-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.milestone}"
    width: "208px"
  sign-tag:
    backgroundColor: "{colors.sign-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "3px 8px 1px"
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

# Design System: GDG ICA

Este documento rige **dos mundos visuales con alcance propio**, que no se mezclan:

| Alcance                               | Mundo                              | Raíz                                                                                     | Tokens                                                                                                    |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sitio público (todo menos `/admin/*`) | «La carretera a Ica»               | `body.site` en `src/layouts/Layout.astro`; sistema en `src/styles/site.css`              | `sand*`, `ink*`, `line`, `asphalt*`, `post`, `sign-*`; tipografía `sign-*`, `plate-*`, `milestone-figure` |
| Panel admin (`/admin/*`)              | «La carta celeste de la comunidad» | `body.admin-atlas` en `src/layouts/AdminLayout.astro`; sistema en `src/styles/admin.css` | `atlas-*`; tipografía `display` a `numeral`                                                               |

Los tokens de un mundo no se usan dentro del otro. Las claves de tipografía, radio y espaciado sin prefijo de mundo (`display`, `headline`, `xs`, `md`, `section`…) pertenecen al panel admin y conservan sus valores.

# Sitio público: «La carretera a Ica»

## Overview

**Creative North Star: "La carretera a Ica"**

El sitio es la Panamericana Sur llegando a Ica. Cada evento es un destino señalizado en un panel de carretera, y la inscripción es la flecha que hay que tomar. Rechaza la landing blanca de comunidad tech con titular, foto al lado y fila de tarjetas iguales. El suelo es arena de la pampa; sobre ella se plantan paneles de esquinas redondeadas con filete blanco interior, en los colores de Google usados como señalética, y los atraviesa una franja de asfalto con línea de carril amarilla discontinua.

La lectura es de conductor: un panel de destino grande arriba (qué viene, cuándo, dónde), placas blancas con cifras a su lado, y bajando por la ruta, estaciones que alternan lado (cómo unirse, cómo apoyar, cómo dar una charla o ser voluntario). Los pictogramas son geoglifos de Nazca de un solo trazo; el del panel de destino se traza como una línea continua al cargar, y los de las estaciones al entrar en pantalla.

Una sola familia de letra de señal, Overpass, pesada en títulos, sin itálicas, con cifras tabulares. Sin degradados de color ni sombras: la profundidad la dan los bordes y los postes.

**Key Characteristics:**

- Arena de la pampa como suelo; asfalto tinta como franja de ruta y pie de página.
- Paneles de señal: banda de color de 10px, filete interior de 5px en blanco (o tinta sobre amarillo), esquinas de 28px / 18px.
- Colores de Google como señalética: verde destino, azul flecha e información, amarillo aviso, rojo obligatorio.
- Placas blancas con borde tinta de 3px para cifras y datos.
- Geoglifos de Nazca de un solo trazo como pictogramas, trazados con movimiento solo si está permitido.
- Overpass, pesada (800 a 900) en títulos y acciones, cifras tabulares.

## Colors

Señalética vial sobre arena: cuatro colores de panel saturados, una tinta asfalto y neutros cálidos de pampa.

### Primary

- **Verde destino** (`sign-green`): el panel de destino del próximo evento, la estación «Únete a la comunidad», el ítem de navegación actual y en hover, el botón verde («Únete en gdg.community.dev») y la CTA «Únete» de la cabecera cuando no hay inscripción abierta. Hover en **verde profundo** (`sign-green-deep`).

### Secondary

- **Azul flecha** (`sign-blue`): la flecha de inscripción («Inscríbete gratis»), el botón sólido, la CTA «Inscríbete» de la cabecera y la estación de información «Da una charla o sé voluntario». También cursor de texto y `accent-color`. Hover en **azul profundo** (`sign-blue-deep`).

### Tertiary

- **Amarillo aviso** (`sign-yellow`): la placa «Faltan» de cuenta regresiva, la estación «Apoya a la comunidad», el botón amarillo, la selección de texto y la línea de carril. Siempre con texto tinta, nunca blanco. Hover en **amarillo profundo** (`sign-yellow-deep`).
- **Rojo obligatorio** (`sign-red`): lo obligatorio y la tapa del hito del próximo evento. Hover del botón rojo en **rojo profundo** (`sign-red-deep`).

### Neutral

- **Arena** (`sand`): fondo de todo el sitio y `theme-color` del navegador.
- **Arena honda** (`sand-deep`): el geoglifo grande trazado sobre la arena en la cabecera de las páginas interiores (desde `lg`), como las líneas de la pampa.
- **Arena clara** (`sand-pale`): hover de placas y botones blancos; superficie de sección.
- **Tinta** (`ink`): texto principal, bordes de placas, fondo de los ítems de navegación, anillo de foco.
- **Tinta tenue** (`ink-muted`): etiquetas de placa, texto secundario, estado de un hito.
- **Tinta sutil** (`ink-subtle`): el pulgar de la barra de desplazamiento.
- **Filete arena** (`line`): borde de las etiquetas neutras.
- **Asfalto** (`asphalt`): fondo de `.theme-night` (la ruta de eventos y el pie). Mismo valor que la tinta: la tinta es asfalto.
- **Asfalto suave** (`asphalt-soft`): token definido para una superficie anidada sobre asfalto; aún sin uso en el marcado.
- **Gris berma** (`asphalt-muted`): texto secundario sobre asfalto (descripción y línea legal del pie).
- **Poste** (`post`): los postes de los paneles y la berma bajo los hitos (al 60%).
- **Blanco de señal** (`sign-white`): placas, hitos, filete interior de los paneles, texto sobre verde, azul y rojo.

### Named Rules

**The Señalética Rule.** Cada color de Google significa una cosa, como en la carretera: verde es destino y evento, azul es la flecha de inscripción e información, amarillo es aviso y cuenta regresiva (con texto tinta), rojo es lo obligatorio y la tapa del hito del próximo evento. La estación de speakers y voluntarios es azul de información, no roja. Un color no se elige por variedad.

**The Puente del Sitio Rule.** Dentro de `.site`, `src/styles/site.css` reasigna los tokens heredados (`primary`, `secondary`, `tertiary`, `gray-custom`, `section` y los `google-*`) a valores del mundo para que las páginas aún no migradas no rompan la arena. Es un mecanismo de transición, no la paleta: el código nuevo usa solo los tokens de este mundo, y el puente se retira cuando la última página migre. No se citan sus valores como colores del sistema.

## Typography

**Display Font:** Overpass Variable (con sans-serif), pesos 800 y 900
**Body Font:** Overpass Variable, 400 a 700
**Label Font:** Overpass Variable, 800, mayúsculas espaciadas

**Character:** Una sola familia de letra de señal hace todo: la Overpass, heredera de la Highway Gothic, se pone negra y apretada en los nombres de destino y regular en el texto. Sin itálicas. Autoalojada con la API de fuentes de Astro (proveedor local, `@fontsource-variable/overpass`, eje `wght` 100 a 900, variable `--font-overpass`); el token es `--font-sign`.

### Hierarchy

- **Display** (`sign-display`, 900, interlínea 0.92): el nombre del destino en el panel verde («DevFest ICA 2026»).
- **Title** (`sign-title`, 900): títulos de sección sobre asfalto («La ruta de la comunidad»).
- **Station** (`sign-station`, 900, interlínea 1.02): el nombre de cada estación dentro de su panel.
- **Heading** (`sign-heading`, 800): token definido para subtítulos; aún sin uso en el marcado.
- **Lede** (`sign-lede`): el texto que acompaña a cada estación.
- **Body** (400, 16px): texto de tablas y descripciones.
- **Action** (800, 16px): botones; 15px en la navegación. La flecha usa 900 a 24px (30px desde `sm`).
- **Label** (`sign-label`, 800, 14px, tracking 0.12em, mayúsculas): títulos de columna del pie en amarillo; los meses y el estado de los hitos usan la misma voz a tracking 0.08em.
- **Cifras**: placas del panel de destino a 20px en celular y 28px desde `lg` (`plate-figure-sm`, `plate-figure`); cifras de la estación «Únete» a 24px y 32px desde `sm` (`plate-figure-stat`); día del hito a 44px (`milestone-figure`). Siempre 900 y tabulares. Etiqueta de placa (`plate-label`) en 700, 14px en celular y 16px desde `lg`, tinta tenue.

### Named Rules

**The Letra de Señal Rule.** Una sola familia, Overpass, sin itálicas. La jerarquía sale del peso (900 destino, 800 acción, 400 texto) y del tamaño, nunca de una segunda familia.

**The Separador de Ruta Rule.** El punto medio U+00B7 de Overpass queda descentrado; los separadores de fecha, hora y lugar usan U+2219 («∙») dentro de un `span` con `aria-hidden`, seguido de una coma solo para lectores de pantalla.

**The Cifra Tabular Rule.** `time`, `table`, `.tabular` y toda cifra de placa o hito usan cifras tabulares.

## Layout

Contenedor `max-w-site` de 82rem con márgenes de 16px (32px desde `md`). La página es una ruta vertical:

1. **Cabecera:** la placa de marca a la izquierda y la navegación de placas a la derecha desde `lg`; debajo de `lg`, un botón «Menú» que abre un panel de arena entre filetes tinta de 3px con los mismos ítems a ancho completo. Fuera de la portada, la cabecera añade la CTA («Inscríbete» azul o «Únete» verde).
2. **Panel de destino:** desde `lg`, una rejilla 2.15 : 1; a la izquierda el panel verde sobre dos postes, con la flecha azul apoyada en su borde inferior derecho; a la derecha una columna de placas y el botón de contorno «Únete a la comunidad». En celular la flecha baja a ancho completo bajo el panel y las placas se ponen en fila.
3. **Ruta de la comunidad** sobre asfalto: título y enlace, hitos en fila con desplazamiento horizontal, berma y línea de carril.
4. **Estaciones:** rejilla 5 : 7 desde `lg`, que alterna de lado (`reverse` en la del medio), con 56px de aire vertical (80px desde `md`). El panel va a un lado y el texto con sus placas y botones al otro.
5. **Pie** sobre asfalto, abierto por un borde de arena de 12px y una línea blanca de 6px, con línea de carril antes de la línea legal.

Las páginas interiores abren con una cabecera de 48px / 80px de aire, centrada a 768px o a ancho completo, con un geoglifo grande en arena honda a la derecha desde `lg`.

La tira de fotos es una rejilla de 2 columnas (4 desde `md`) con la primera foto a 2×2 y filas de 9, 11 y 13rem.

## Elevation & Depth

Plano. No hay `box-shadow` en el sitio. La profundidad de la carretera se dibuja: los paneles se levantan sobre postes de color poste (16px de ancho en el destino, 12px en las estaciones, solo desde `lg`), las placas se recortan con un borde tinta de 3px y la ruta se separa de la arena por el bloque de asfalto. La línea de carril se pinta con un `repeating-linear-gradient` de cortes duros (tramos de 4.5rem, huecos de 3rem); es una línea discontinua, no un degradado.

### Named Rules

**The Poste y Borde Rule.** Nada flota. Un panel se sostiene en postes; una placa se recorta con borde tinta; nunca una sombra difusa ni un degradado de color.

## Shapes

Geometría de señal vial.

- **Panel de señal** (`sign-panel`): banda de color con esquina de 28px y 10px de relleno, y dentro una cara (`sign-face`) con filete de 5px en `currentColor` (blanco sobre verde, azul y rojo; tinta sobre amarillo) y esquina de 18px.
- **Placa** (`plate`): borde tinta de 3px, esquina de 10px.
- **Botón y navegación**: placa de 10px rellena del color, con 3px de banda y un filete interior de 2px (blanco, o tinta sobre amarillo y blanco) de esquina 7px.
- **Flecha**: un pentágono recortado (`clip-path`) con la punta a la derecha y esquinas redondeadas solo a la izquierda; la cara azul va 5px dentro de un contorno blanco.
- **Hito**: placa blanca de arco superior (radio 6.5rem) con tapa de color de 24px y borde blanco de 3px, como un hito kilométrico.
- **Etiqueta**: esquina de 6px, borde tinta de 2px.
- **Geoglifo**: un único trazo (`pathLength` 1) de puntas y uniones redondeadas, en `currentColor`, dentro de una caja de 200; enmarcado en el panel de destino por un recuadro de 4px y esquina de 14px.

## Components

### Buttons

Placas de señal con filete interior, firmes, sin sombra.

- **Shape:** placa de 10px con banda de 3px y filete interior de 2px a 7px.
- **Primary (`solid`):** azul flecha, texto blanco, 800, relleno 10px 24px 8px.
- **Por color:** `green`, `yellow` (texto y filete tinta) y `red` siguen la Señalética Rule.
- **Outline:** banda tinta, cara blanca; el acompañante de cualquier acción de color («Conoce al equipo», «Ver patrocinadores», «Propón una charla»). **White:** cara blanca con filete tinta.
- **Hover / Focus:** la banda baja a su tono profundo; las caras blancas pasan a arena clara. Transición de color. Foco con anillo tinta de 3px a 3px de distancia (blanco sobre asfalto y sobre paneles de color).

### Flecha de inscripción (firma)

La acción principal tiene forma de flecha de carretera: cara azul con texto blanco 900, contorno blanco, 80px de alto (96px desde `sm`), punta de 52px. Desde `lg` se apoya en el borde inferior del panel de destino a 3rem de su derecha, con 26rem de ancho. Su texto es «Inscríbete gratis» si hay formulario, «Ver el evento» si no, o «Únete a la comunidad» sin evento.

### Panel de destino (firma)

Panel verde con el colibrí en un recuadro cuadrado a la izquierda (42% de la cara desde `sm`) y, a la derecha, el nombre en display, la fecha · hora y el lugar en 20px / 26px 700, y el enlace subrayado «Agenda, speakers y ubicación». Sin evento, dice «GDG ICA» y que vienen nuevos eventos.

### Placas de cifras

Placa blanca (amarilla para «Faltan») con etiqueta en tinta tenue y cifra 900 tabular; en fila en celular, apiladas con etiqueta y cifra en una línea desde `lg`. La cuenta regresiva solo se muestra si falta al menos un día.

### Hitos de la ruta (firma)

Fila de hitos de 208px sobre asfalto, con desplazamiento horizontal: día en 44px, mes y año en 18px 800 espaciado, nombre del evento en 700 (tres líneas como máximo) y estado (Próximo, En curso, Realizado) en tinta tenue. La tapa es roja para lo que viene; los pasados toman el color de su categoría (DevFest e I/O azul, Study Jam y WTM verde, Meetup amarillo, Hackatón tinta). Hover: subrayado del nombre.

### Estaciones de la ruta

Panel de color con su geoglifo (96px, 128px desde `sm`, trazo 6) y el nombre en `sign-station`, sobre dos postes; al lado, el lede, las placas y un par de botones (uno de color, uno de contorno).

### Chips (etiquetas)

- **Style:** 12px 800, mayúsculas espaciadas, borde tinta de 2px, esquina 6px; el color sale de la categoría o el estado. Etiquetas libres en blanco con borde filete arena, sin mayúsculas.
- **Destacado:** amarillo con estrella de trazo.

### Navigation

- **Cabecera:** placa de marca blanca (logo 36px, «GDG ICA» 20px 900 y «Google Developer Group» 11px 700). Ítems como placas tinta con filete blanco, 15px 800; hover y actual (`aria-current="page"`) en verde destino.
- **Celular:** botón «Menú» tinta con iconos de trazo; panel de arena que se cierra con Escape y devuelve el foco al botón.
- **Pie:** colibrí amarillo de 96px, columnas con título en `sign-label` amarillo y enlaces blancos 600 que se subrayan en hover; línea legal en gris berma.
- **Saltar al contenido:** placa blanca fija arriba a la izquierda, visible al recibir foco.

### Geoglifos

Pictogramas de Nazca (colibrí, mono, palmera, araña…) de un solo trazo en `currentColor`. El del panel de destino se dibuja al cargar (`glyph-draw`: 2.6s, `cubic-bezier(0.65, 0, 0.35, 1)`, 0.2s de espera); los de las estaciones se dibujan al entrar en pantalla con `animation-timeline: view()` (de `entry 10%` a `cover 45%`). Ambos solo con `prefers-reduced-motion: no-preference`; sin movimiento, el trazo se ve completo.

### Fotos y patrocinadores

Fotos recortadas en placas de borde tinta de 3px; logos de patrocinadores centrados en placas blancas de 96px de alto, en rejilla de 2 y 4 columnas, con hover en arena clara.

## Do's and Don'ts

### Do:

- **Do** usar solo los tokens de este mundo en código nuevo del sitio; el puente de `.site` es para lo no migrado.
- **Do** dar a cada color de Google su papel de señal: verde destino, azul flecha e información, amarillo aviso con texto tinta, rojo obligatorio y tapa del próximo hito.
- **Do** usar la forma de flecha una sola vez por pantalla, y siempre para la acción principal.
- **Do** levantar los paneles sobre postes y recortar las cifras en placas blancas con borde tinta de 3px.
- **Do** dibujar los pictogramas como geoglifos de un solo trazo en `currentColor`, y animar su trazo solo con movimiento permitido.
- **Do** separar fecha, hora y lugar con U+2219 en un `span` con `aria-hidden`, más una coma para lectores de pantalla.
- **Do** usar cifras tabulares en placas, hitos, fechas y tablas.
- **Do** emparejar cada acción de color con un botón de contorno para la alternativa.

### Don't:

- **Don't** usar `box-shadow`, sombras duras ni degradados de color; la línea de carril de cortes duros es la única excepción técnica.
- **Don't** volver a la landing blanca de comunidad tech con titular, foto al lado y fila de tarjetas iguales.
- **Don't** usar el rojo para una estación, una categoría o un adorno: es lo obligatorio y la tapa del próximo hito.
- **Don't** poner texto blanco sobre amarillo.
- **Don't** usar una segunda familia, itálicas, ni el punto medio U+00B7 como separador.
- **Don't** usar los tokens `atlas-*` ni Archivo en el sitio público.
- **Don't** usar emoji ni caracteres como iconos; los iconos son SVG de trazo.

# Panel admin: «La carta celeste de la comunidad»

Alcance: este sistema rige **solo el panel admin (`/admin/*`)**, montado por `src/layouts/AdminLayout.astro` con la clase `admin-atlas` en `<body>`. El sitio público (`src/layouts/Layout.astro` y sus páginas, bajo `body.site`) tiene su propio mundo, «La carretera a Ica», documentado arriba.

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
