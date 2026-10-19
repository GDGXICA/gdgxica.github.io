---
version: 1
slug: "src-pages"
primary_target: "src/pages"
related_targets: ["src/layouts/Layout.astro", "src/components"]
---

# Surface brief — Sitio público (gdgica.com)

Scope: todo el sitio público montado por `src/layouts/Layout.astro` (home, eventos, detalle de evento, about, sponsors, voluntariado, foro, legales, 404) y, en la última entrega, las páginas del día del evento (credencial, fotos, subir, jugar, proyector, mural). El panel admin queda fuera.

Visitor mode por página: home **Persuade** (decidir e inscribirse), `/events` **Operate** (encontrar un evento), detalle de evento **Persuade** con la agenda en registro **Read**.

Audiencia y tarea: gente de Ica que llega desde el celular por un enlace o un QR, quiere saber qué evento viene, cuándo y dónde, e inscribirse; después, unirse a la comunidad; sponsors y aliados que evalúan apoyar; speakers y voluntarios. Orden de acciones: inscribirse → unirse → apoyar → hablar o ayudar.

Prueba y contenido: datos reales de `gdg-ica-data` (eventos, inscritos sincronizados de community.dev, speakers, sponsors, equipo); cifras contadas desde las colecciones, miembros y años desde `stats.json`. Fotos reales pequeñas (640–900px). Sin testimonios ni métricas inventadas.

Restricciones: paleta de Google (decidida por el usuario); Nazca obligatoria; ilustraciones propias; fuentes autoalojadas por la CSP (máximo 2 paquetes `@fontsource-variable`); el admin no cambia; Geist sigue cargando en `/credencial` por el canvas.

Entregas: (1) sistema + cabecera/pie + home; (2) `/events` y detalle, antes del DevFest del 28/11; (3) el resto del sitio y 404; (4) páginas del día del evento, después del DevFest.

Pendiente para la entrega 2: ronda de composición de `/events` y del detalle del evento.

## Direction contract

THESIS: El sitio es la carretera a Ica: cada evento es un destino señalizado en un panel de carretera y la inscripción es la flecha que hay que tomar. Rechaza la landing blanca de comunidad tech con titular, foto al lado y fila de tarjetas iguales.

OWN-WORLD: Suelo de arena de la pampa #EAD6AE. Paneles de señal de esquinas redondeadas con filete blanco interior, en los colores de Google usados como la señalética: verde #188038 destino y evento, azul #1A73E8 la flecha de inscripción e información, amarillo #FBBC04 aviso y cuenta regresiva con texto tinta, rojo #D93025 lo obligatorio y las tapas de los hitos. Tinta asfalto #202124 para texto y para la franja de asfalto con línea de carril amarilla discontinua. Placas blancas con borde tinta para cifras. Geoglifos de Nazca como pictogramas de un solo trazo blanco. Una sola familia de letra de señal, pesada en títulos, sin itálicas; cifras tabulares. Sin degradados ni sombras difusas.

STORY: En un vistazo se entiende que viene el DevFest ICA 2026, cuándo y dónde, y se toma la flecha azul para inscribirse; bajando por la ruta aparecen en orden cómo unirse, cómo apoyar como sponsor y cómo dar una charla o ser voluntario.

FIRST VIEWPORT: Home a 1440×900: placas de dirección como menú arriba, con la marca GDG ICA en placa blanca a la izquierda; panel verde de unos dos tercios del ancho con el colibrí en un cuadro de filete blanco a la izquierda y «DevFest ICA 2026», fecha y sede en blanco; la flecha azul «Inscríbete gratis» montada sobre el borde inferior del panel; postes de metal bajo el panel; a la derecha una columna de placas con días que faltan (amarilla), inscritos de cupos y comunidad desde 2015, más «Únete»; abajo la franja de asfalto con los próximos eventos como hitos de tapa de color. Celular: placa de marca y menú, panel verde a todo el ancho, flecha azul debajo, placas en fila.

FORM: Señales de la Panamericana, señalética turística vial del Perú, candidato 7 de mi lista ordenada; variante «Panel de destino» con la paleta de Google. Firma: el geoglifo del panel se traza como una sola línea continua al cargar, en CSS y solo con movimiento permitido. Reglas tomadas de las tarjetas descartadas: contadores honestos con el dato real; estaciones en orden, una señal por acción; bloques macizos separados por franjas de arena; una señal, un mensaje, con la jerarquía en el tamaño y el color del panel; la forma de flecha aparece una vez por pantalla y siempre es la acción principal. seed:049fae32d91bcc46

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
