# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

### Sitio público (gdgica.com)

- **Gente de Ica que llega a un evento** — estudiantes de institutos y universidades, devs junior y profesionales de la región que vienen por un enlace compartido (WhatsApp, Instagram, LinkedIn) o por el flyer, casi siempre desde el celular. Quieren saber qué es, cuándo, dónde y si vale la pena, e inscribirse.
- **Quien quiere sumarse a la comunidad** — después de un evento, busca cómo seguir: los canales, el próximo evento, el foro.
- **Sponsors y aliados** — empresas, instituciones y emprendimientos locales que evalúan el alcance de la comunidad antes de apoyar.
- **Speakers y voluntarios** — gente que quiere dar una charla o ayudar en la organización.

### Panel admin

El panel admin (`/admin/*`) tiene dos usuarios principales con el mismo peso:

- **Organizadores y admins** — un núcleo chico de la comunidad GDG ICA que, en laptop y entre eventos, gestiona eventos, speakers, sponsors, ubicaciones, foro, formularios, certificados y accesos de otras personas.
- **Staff del evento (voluntarios)** — personas asignadas a un evento concreto que, desde el celular y bajo presión el día del evento, hacen check-in en la puerta, credenciales, moderación del mural y minijuegos. No tienen permisos globales: todo su trabajo vive dentro de los eventos a los que están asignados.

Audiencias secundarias confirmadas en el código:

- **Colaboradores externos (`contributor`)** — proponen eventos, speakers y posts para revisión; no publican.
- **Revisores** — aprueban, piden cambios o rechazan propuestas y solicitudes de acceso.
- **Miembros (`member`)** — cualquiera que inicia sesión; sin acceso al panel hasta que solicita uno o redime una invitación.

## Product Purpose

**Sitio público:** presentar la comunidad GDG ICA y sus eventos, y llevar a cada visitante a la acción que le toca, en este orden de prioridad (confirmado por el usuario, 2026-10-18): (1) inscribirse al próximo evento en gdg.community.dev, (2) unirse a la comunidad, (3) apoyar como sponsor o aliado, (4) postular como speaker o voluntario. Éxito: quien llega desde el celular entiende en segundos qué evento viene y se inscribe; quien ya fue encuentra cómo seguir.

**Panel admin:** operar la comunidad GDG ICA (Ica, Perú): publicar el contenido del sitio público gdgica.com y llevar el día del evento. Los cambios de contenido se escriben en el repo público `GDGXICA/gdg-ica-data` y disparan una reconstrucción del sitio; las operaciones del evento (asistencia, credenciales, mural, minijuegos) viven en Firestore en tiempo real.

Éxito: un organizador publica o corrige contenido sin miedo a romper el sitio, y un voluntario sabe en segundos qué le toca hacer en su evento y lo hace desde el celular aunque el wifi falle.

## Positioning

**Sitio público:** el capítulo de Google Developer Groups de Ica, activo desde 2015. Lo que ningún otro GDG puede decir: es de Ica — el desierto, Nazca, la Huacachina, Paracas, los viñedos — y la comunidad se reúne en persona en la región. Los eventos (DevFest, Build with AI, talleres, study jams) son gratuitos y se registran en gdg.community.dev.

**Panel admin:** herramienta interna de una comunidad de voluntarios, no un producto comercial. Lo que la distingue de un CMS genérico: permisos por evento con vencimiento, propuestas de externos con revisión y publicación como pasos separados, auditoría de cada escritura con motivo obligatorio, y operaciones del día del evento que funcionan sin conexión.

## Operating Context

### Sitio público

- La mayoría de visitas llega desde el celular, por un enlace compartido o un QR impreso, muchas veces con datos móviles.
- El contenido sale del repo público `GDGXICA/gdg-ica-data` en tiempo de build; las fotos se copian de `images/` al desplegar. Un evento cambia de estado (`upcoming`, `in-progress`, `completed`) solo cuando se edita el dato y se reconstruye el sitio.
- Las páginas del día del evento (credencial, `/jugar`, proyector, mural) se usan en vivo durante el evento y se proyectan en pantalla grande.

### Panel admin

- **Entre eventos**: laptop, sesiones largas de edición (formulario de evento con agenda multi-track, speakers, sponsors), revisión de propuestas y de solicitudes de acceso, cambios de rol con motivo escrito.
- **Día del evento**: celular en una mano, cola de asistentes delante, wifi del local poco fiable. Check-in contra el roster importado del CSV de Bevy, con comparación de DNI; mural y minijuegos proyectados en pantalla grande y moderados desde el panel.
- Publicar contenido tarda: escribe en GitHub y reconstruye el sitio. Guardar un borrador no reconstruye.
- Todo el contenido y la interfaz están en español (Perú).

## Capabilities and Constraints

- Astro 7 estático + islas React 19 + Tailwind 4; sin SSR. Firebase Auth (Google Sign-In), Firestore, Storage, Cloud Functions (`/api/*`).
- Acceso por **permisos**, no por jerarquía de roles: roles `member`, `contributor`, `volunteer`, `organizer`, `admin` como paquetes de permisos, más permisos `perEvent` vía `events/{slug}/staff/{uid}` y overrides por usuario (`grants`/`revocations`). La UI solo oculta; el servidor y las rules deciden.
- El repo de datos es público: un borrador está "sin publicar", nunca es secreto.
- Markdown del foro: nunca HTML crudo; la vista previa del panel renderiza el mismo contenido que el sitio.
- Las operaciones del evento no deben depender del repo de datos en GitHub para funcionar (hoy el selector de eventos sí depende — decisión abierta).
- Terminología propia: evento, speaker, sponsor, check-in, credencial, mural, minijuego, propuesta, acceso, staff/asignación.

## Brand Commitments

- Nombre: **GDG ICA**. Logo en `public/gdg-logo.png`; el logo oficial del capítulo no se recolorea ni se redibuja.
- **Sitio público** (confirmado por el usuario, 2026-10-18): identidad visual propia de Ica, con **los colores de Google como paleta del sitio** (el usuario lo pidió al elegir la dirección, revisando su respuesta anterior de usarlos solo como firma). Las líneas de Nazca son material obligatorio; el resto del mundo de Ica (Huacachina y sus dunas y palmeras, mantos de Paracas, viñedos y pisco, huarangos, el desierto) queda abierto. Las ilustraciones son propias, no copias de dibujos publicados.
- El panel **no** está atado a las guías de marca de Google Developer Groups ni a los colores del sitio público: es una herramienta interna con libertad visual (confirmado por el usuario, 2026-10-18).
- Voz: español directo, que explica el porqué de cada regla ("Aprobar no publica", "tus permisos no han cambiado").

## Evidence on Hand

- Datos reales de eventos, equipo, speakers, sponsors y galería en `GDGXICA/gdg-ica-data`.
- Fotos reales de eventos en `public/carousel/` y `public/gallery/` (ignoradas por git): 16 fotos de carrusel de 640px y 10 de galería de 900px; no hay fotos grandes.
- Flyers de eventos en `images/events/` del repo de datos (el de DevFest 2026 es casi cuadrado, 1080×1120).
- Cifras de la comunidad: eventos, speakers, organizadores y sponsors se cuentan desde las colecciones; miembros y años activos salen de `about/stats.json` (sus otros valores no cuadran con los datos y no se muestran).
- No hay métricas de uso del panel, testimonios ni estudios de usuarios; no inventarlos.

## Product Principles

Sitio público:

1. **El próximo evento primero.** Si hay un evento por venir, la inscripción es la acción más visible del sitio.
2. **Ica, no una plantilla.** Lo que se ve tiene que poder ser solo de Ica; los colores de Google ponen la paleta, pero el mundo, las formas y las ilustraciones son de Ica.
3. **Celular y datos móviles primero.** Lo importante cabe en el primer pantallazo del teléfono y carga liviano.

Panel admin:

1. **Cada persona ve su trabajo.** El panel se organiza por lo que el usuario puede y debe hacer ahora, no por la lista completa de secciones.
2. **El día del evento manda.** Lo que se usa en la puerta tiene que funcionar en el celular, sin conexión y sin dudas sobre el estado.
3. **Las decisiones con consecuencias se ven antes de tomarse.** Cambios de rol, publicaciones y borrados muestran qué va a cambiar y piden motivo.
4. **Hablar como la comunidad, no como el código.** Nombres de eventos y personas, no slugs, uids ni claves de permiso.
5. **Ocultar no protege.** La interfaz refleja los permisos reales, pero nunca es la barrera.
