---
version: 1
slug: "src-components-react-admin"
primary_target: "src/components/react/admin"
related_targets: ["src/pages/admin", "src/layouts/AdminLayout.astro"]
---

---

version: 1
slug: "src-components-react-admin"
primary_target: "src/components/react/admin"
related_targets: ["src/pages/admin","src/layouts/AdminLayout.astro"]
---

---

version: 1
slug: "src-components-react-admin"
primary_target: "src/components/react/admin"
related_targets: ["src/pages/admin","src/layouts/AdminLayout.astro"]
---

# Surface brief — Panel admin (`/admin/*`)

Scope: el shell del panel (menú, cabecera, cambio de modo), el dashboard, las primitivas compartidas y, en entregas siguientes, todas las secciones. Visitor mode: **Operate**.

Audiencia y tarea: organizadores en laptop (gestión de contenido y accesos) y staff del evento en celular (check-in, credenciales, mural, minijuegos), con el mismo peso. Dos modos: **gestión** (escritorio, riel lateral) y **evento en vivo** (una sola tarea, táctil, distinto a la vista). Evitar: corporativo, juguetón, denso, «Google».

Entregas: (1) sistema visual + shell + menú agrupado + dashboard por rol; (2) secciones al sistema + harden + clarify; (3) propuestas con formularios.

Decididas: una sola familia autoalojada, Archivo Variable (el usuario descartó la serif itálica de catálogo el 2026-10-18); solo noche, sin variante clara.

Pendientes para la entrega 2 (registradas en la revisión final de la entrega 1):

- Check-in: botones «Marcar» en ember relleno en cada fila; encabezado «Check-in · slug» que repite la banda; borde izquierdo de color en las filas marcadas (rechazo del piso de oficio).
- Eventos: enlaces de acción con emoji («🎮 Mini-juegos», «👥 Equipo») y colores sueltos.
- Roles: nota de solo lectura pintada como alerta de error; tarjetas de rol del mismo tamaño.
- Migrar cada sección del puente de colores a los tokens atlas, y retirar el puente al final.
- Selector de eventos con títulos (no slugs) usando el catálogo público `/events.json`.

## Direction contract

THESIS: El panel es una carta celeste de la comunidad: cada cosa tiene coordenadas (fecha, alcance, estado) y su importancia se lee como magnitud. Rechaza el admin gris de tarjetas blancas con un acento azul.

OWN-WORLD: Fondo noche #0A1021, índigo #16233D y azul carta #24374F en capas; texto polvo de estrellas #F2F2E9, velo #8A93A6 para lo secundario; ámbar estelar #FF4D2E solo para la acción principal, el foco y lo que te necesita; ámbar claro #FFB36B para anotaciones. Filetes de un píxel con nodos en los cruces. Una sola familia, Archivo: nombres y títulos en su corte ancho y seminegrito (ancho 118%), como las designaciones de una carta; etiquetas en versalitas espaciadas; cifras tabulares. Sin brillos ni degradados.

STORY: Quien entra sabe en un vistazo qué le toca: sus eventos, lo pendiente y su alcance. El voluntario aterriza en su evento, no en un saludo.

FIRST VIEWPORT: Riel izquierdo de 248px en noche con 4 grupos (Contenido, Evento en vivo, Comunidad, Acceso) y conteos de pendientes. Cabecera: título de página en Archivo ancha seminegrita 36px, la línea de coordenadas debajo (alcance, rol, próximo evento) y la acción primaria a la derecha. Cuerpo: banda de efemérides con los próximos eventos trazados en una carta de fechas y, debajo, «Tus eventos» y «Te esperan».

FORM: Atlas estelar (challenger elegido por el usuario: notation-diagram-systems-star-atlas). Movimiento firma: la retícula de localización, un anillo ámbar con cruz que marca el elemento bajo foco, la fila seleccionada y el evento que te necesita; y la magnitud, con el tamaño del punto en una rampa fija para la urgencia. Modo evento: banda de observación a sangre con estado de sincronización y conteos en vivo, más una barra de pestañas inferior en el celular. seed:a91ef54a19654b63

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
