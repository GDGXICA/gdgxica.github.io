---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets:
  ["src/components/home", "src/components/night", "src/styles/night.css"]
---

# Home pública (gdgica.com/)

## Scope and mode

Persuade. Visitante: estudiantes y devs de Ica (muchos en el celular, con datos), asistentes que vuelven buscando el próximo evento, posibles speakers y sponsors. Acción: registrarse al próximo evento destacado (hoy DevFest Ica 2026) y unirse a la comunidad. Prueba real: datos de gdg-ica-data (eventos, registrados/cupos, cifras), fotos propias de eventos, la credencial que ya existe en /events/{slug}/credencial. Restricciones: titular "GDG Ica" (decisión del usuario 2026-11-14); colibrí fiel a la referencia del usuario; Google blue para la acción; sin inventar cifras ni testimonios.

## Direction contract

THESIS: La home es una hoja de relevamiento aéreo de la pampa de Nazca: la comunidad trazada como datos sobre el desierto donde está el colibrí. Rechaza el dark SaaS genérico (blobs, vidrio, titular centrado sobre tarjetas iguales) y el scrapbook de papel de la versión anterior.
OWN-WORLD: Noche de la pampa #070b16 con superficies escalonadas #0c1322/#111a2e y filetes de arena al 10–20%; tinta arena #ecebe2; ocre del geoglifo #d4ad62 para líneas, marcas de esquina y datos destacados; azul Google solo en la acción; puntos de color Google como códigos de categoría. Bricolage Grotesque para voz, Geist Mono para todo dato medido (fechas, horas, coordenadas, cifras). Paneles con radio 10px y marcas de registro ocre en las esquinas; botones y barra de comando con esquinas cortadas en diagonal y celda de ícono (pedido del usuario 2026-11-14: los botones se veían genéricos, "nada tech").
STORY: Entiende qué es GDG Ica y que el DevFest es el sábado 28 en la UTP, gratis; cree porque ve registrados, cupos, años y fotos reales; se registra, se pone la credencial con su nombre y se une.
FIRST VIEWPORT: Escena WebGL a sangre completa de uno de dos sitios, elegido al azar por visita con un selector "Colibrí · Huacachina" junto al pie de figura (pedido del usuario 2026-11-14): la pampa con el colibrí ocre (cámara a ~22°, el ángulo que el usuario elogió) o la Huacachina como curvas de nivel con la laguna brillando (~30°, para ver dentro del cuenco); el horizonte cae en el tercio superior. Arriba izquierda "GDG Ica" en Chakra Petch 700 hasta 7rem, relleno ocre iluminado desde arriba con resplandor, trazado como geoglifo al cargar (el usuario eligió la fuente entre 5 renderizadas, 2026-11-14; sus esquinas cortadas son las de los botones), con línea de cota "Google Developer Group · Ica, Perú" de su mismo ancho y la frase "Una comunidad abierta y gratuita para aprender tecnología.", sobre un velo de noche; abajo izquierda el panel de lectura del DevFest (fecha, hora, lugar, entrada en mono; cuenta regresiva; 365/500 con barra) con el botón azul "Regístrate gratis" y "Agenda y speakers". Barra de instrumentos al pie con años, miembros, eventos, speakers. Pie de figura con las coordenadas del sitio.
FORM: Relevamiento aéreo / mission control sobre la pampa; elegido por el usuario (1 de 3 en la ronda de crítica; dirección fijada por el usuario). Interacción firma: la cámara despega del ángulo rasante a la vista cenital al hacer scroll, que es como se leen los geoglifos. seed:1f7d154047fcdea2 (tirada registrada; la dirección sigue fijada por el usuario: eligió "Relevamiento aéreo (Recomendado)" el 2026-11-14)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- DESIGN.md del repo describe el panel admin; el tema público necesita su propia documentación sin pisar la del panel.
