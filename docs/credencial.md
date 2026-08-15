# La credencial: cómo funciona la inscripción de punta a punta

Documenta la funcionalidad que vive en `/events/<slug>/credencial`, hoy activa
en [devfest-2026](https://gdgica.com/events/devfest-2026/credencial/).

Está escrito para dos lectores: quien quiera entender qué le pasa a una
persona que entra a inscribirse, y quien vaya a operar el panel el día del
evento. La última sección recoge las decisiones que sorprenden al leer el
código, con su porqué.

---

## 1. La idea que explica todo lo demás

**Esta página no inscribe a nadie.** La inscripción oficial del DevFest ocurre
en Bevy, la plataforma de Google para comunidades
(`gdg.community.dev`), y GDG Ica no puede escribir ahí por API.

Entonces, ¿para qué existe? Porque el panel oficial es un formulario largo, en
inglés, con sesión que caduca, y mucha gente lo abandona. La credencial invierte
el trato: primero te damos algo que quieres —una tarjeta personalizada, bonita,
lista para publicar en tus redes— y solo después te pedimos los datos y te
empujamos a la inscripción real.

De esa tensión sale toda la arquitectura:

- El asistente obtiene su imagen **antes** de que le pidamos el DNI.
- Nuestro sistema guarda una intención de inscripción, no una inscripción.
- Alguien del equipo tiene que **transcribir** esas intenciones a Bevy.
- Y por eso la métrica que manda en el panel es _«Pendientes de cargar»_: si la
  gente rellena nuestro formulario y nadie las pasa a Bevy, acabamos con una
  lista de personas que **creen** estar inscritas y no lo están. Eso es peor que
  no tener formulario.

Todo lo que sigue es el detalle de ese circuito.

---

## 2. Las piezas

```
Navegador (isla React)
   │  1. Firebase Auth anónima
   │  2. POST  /api/events/:slug/credentials      → nº de orden + letra de grupo
   │  3. PATCH /api/events/:slug/credentials/:id/image
   ▼
Cloud Functions (Express)  ──►  Firestore: events/{slug}/credentials/{id}
   │                            Storage:   credentials/{slug}/{id}/*.jpg
   ▼
drainCredentialEmails (cada 5 min)  ──►  Gmail o Resend  ──►  correo con la tarjeta
                                                                     │
Panel /admin/credentials  ◄── lee Firestore en vivo (onSnapshot)     │
   │                                                                 ▼
   └──► transcripción / CSV ──► Bevy ──► roster ──► conciliación ──► check-in
```

La página existe solo si el evento la activa. En
[`gdg-ica-data`](https://github.com/GDGXICA/gdg-ica-data), el JSON del evento
lleva un bloque:

```json
"credential": {
  "enabled": true,
  "headline": "Soy parte del DevFest ICA 2026",
  "group_letters": ["A", "Q", "I", "C"],
  "max_credentials": 700
}
```

`getStaticPaths` filtra por `credential.enabled === true`, así que para
cualquier otro evento la URL simplemente **da 404**. Es lo correcto en un sitio
estático: no hay una página deshabilitada que mantener.

---

## 3. El recorrido de quien se inscribe

### Paso 1 — La tarjeta (no sale nada del navegador)

Se piden solo cuatro cosas, y ninguna es sensible:

| Campo             | Notas                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| Nombre y Apellido | Obligatorios, máx. 60 caracteres                                                   |
| Usuario de GitHub | Opcional. Se valida con la propia expresión de GitHub y se le quita la `@` inicial |
| Avatar            | Una mascota (por defecto) o una foto propia                                        |

Mientras se escribe, un `<canvas>` va pintando la credencial en vivo, a
**1080×1350 px**. Esa proporción 4:5 no es casual: es la que Instagram y
LinkedIn no recortan.

Si sube una foto:

- Se rechaza antes de leerla si pesa más de 10 MB.
- Se reescala a 512 px **en el dispositivo**, y al reencodearla como JPEG a
  través del canvas se pierden los metadatos EXIF. **La ubicación GPS de la foto
  nunca sale del teléfono.** La página lo dice explícitamente.

El botón _«Generar credencial»_ no llama a ningún servidor: solo pasa al paso 2.
En este punto no hemos guardado absolutamente nada.

### Paso 2 — Los datos, y la tarjeta ya descargable

Aquí aparece el formulario real:

- **DNI** (8 dígitos), **correo**, **empresa** (opcional)
- Tres preguntas de encuesta: cómo se enteró, años de experiencia, nivel con
  herramientas de Google
- **Cinco consentimientos**, ninguno premarcado y todos obligatorios (el
  servidor los exige con `z.literal(true)`, así que no hay forma de saltárselos)

Y —esto es deliberado— la barra de compartir aparece **ya**, en el paso 2. La
persona puede descargarse su credencial y publicarla **antes** de enviar nada.
Sí, eso significa que alguien puede llevarse la tarjeta sin dejarnos sus datos.
Se acepta a conciencia: es lo que hace que el trato se sienta justo, y es lo que
convierte cada credencial compartida en publicidad del evento, porque la propia
tarjeta lleva impreso el QR de inscripción.

### El envío, paso a paso

1. **Sesión anónima.** `signInAnonymouslyIfNeeded()` va primero, siempre. Sin
   token, el cliente devolvería un `"Not authenticated"` en inglés dentro de un
   formulario en español.
2. **`POST /api/events/:slug/credentials`.** Atraviesa, en orden: App Check →
   autenticación → límite de 8 por hora **por IP** → validación Zod estricta.
3. **Dentro de una transacción**, el servidor lee un contador, comprueba el
   cupo (700), asigna el **número de orden** y calcula la **letra de grupo**
   repartiendo `["A","Q","I","C"]` de forma cíclica: la nº 1 es «A», la 2 «Q»,
   la 5 vuelve a «A». Esa letra sirve para partir a la gente en grupos el día
   del evento sin tener que decidirlo después.
4. **La respuesta trae la letra**, y solo entonces el navegador vuelve a pintar
   la tarjeta —ahora con la letra correcta— y la sube en una **segunda llamada**,
   `PATCH …/image`.

Ese segundo viaje es la parte menos evidente del diseño y tiene una razón
concreta: la letra la decide el servidor, así que cualquier tarjeta compuesta
antes de la respuesta llevaría un hueco donde va la letra. En la primera prueba
real se guardó exactamente eso. El adjunto se manda sin esperar respuesta: si
falla, la inscripción ya está hecha y no se convierte en un error para quien la
hizo.

### Lo que ve al terminar

Una pantalla de éxito con tres bloques, en este orden:

1. «¡Listo! Tu credencial ya es tuya.»
2. Un aviso **ámbar, grande, imposible de ignorar**: _«Todavía no estás
   inscrito»_, con el botón hacia el panel oficial de Bevy y la advertencia de
   que esa sesión caduca a los 15 minutos.
3. Su letra de grupo.

El formulario se desmonta: no se puede reenviar por accidente.

En los siguientes cinco minutos le llega el correo con la tarjeta adjunta.

> **Si el asistente hace solo esto y nada más, no está inscrito.** Ese aviso
> ámbar es la pieza más importante de toda la pantalla.

---

## 4. El recorrido de quien administra

El panel está en `/admin/credentials?slug=devfest-2026`. No lee por la API: se
suscribe a Firestore en vivo con `onSnapshot`, así que se actualiza solo mientras
la gente se inscribe. Lo que puede leerse lo decide `firestore.rules` con el
permiso `roster:read`.

### La pantalla

Cinco métricas arriba, con _«Pendientes de cargar»_ resaltada:

| Métrica                  | Qué significa                                                    |
| ------------------------ | ---------------------------------------------------------------- |
| **Pendientes de cargar** | Gente que llenó nuestro formulario y **todavía no está en Bevy** |
| Cargados                 | Ya transcritos o emparejados por conciliación                    |
| Total                    | Credenciales creadas                                             |
| Fotos por revisar        | Cola de moderación                                               |
| DNI duplicados           | Dos registros declaran el mismo número                           |

Y tres pestañas: **Cola Bevy**, **Fotos** (solo admin) y **Todos**.

### El trabajo del día a día

**a) Pasar la gente a Bevy.** Hay dos caminos, y conviene usar el segundo:

- _Uno a uno_, en la pestaña «Cola Bevy». Cada ficha trae un botón de **copiar
  por campo**, porque quien hace esto está corriendo contra el temporizador de
  15 minutos de Bevy y no puede perder tiempo seleccionando texto a mano. El DNI
  sale **enmascarado**, con un botón «ver» para descubrirlo.
- _En bloque_, con **«Descargar CSV para Bevy»**, que alimenta la carga masiva
  del panel oficial. Solo exporta las pendientes, así que repetirlo tras una
  carga parcial no duplica a nadie.

Después se marca cada ficha: **cargado** (con su número de ticket), **no
encontrado**, **descartado**, o **volver a pendiente**.

**b) Conciliar.** Tras importar el roster desde Bevy, el botón **«Conciliar con
Bevy»** cruza ambas listas **por correo electrónico** y hace dos cosas:

- Marca como cargadas las credenciales de quien ya aparece en Bevy —incluida la
  gente que se inscribió por su cuenta sin pasar por nosotros—. Así _«pendiente»_
  deja de significar «nadie ha hecho clic» y pasa a significar «no está en el
  panel oficial», que es lo que hace fiable la métrica.
- **Estampa el DNI y el id de credencial en la fila del roster.** Esta es la
  razón por la que se pide el DNI: el día del evento, en la puerta, un voluntario
  compara el número del documento contra el número en pantalla en vez de
  guiarse por el nombre.

Es idempotente: pulsarlo dos veces no rompe nada. Si dos credenciales comparten
correo, no adivina — las deja sin emparejar y las reporta como ambiguas.

**c) Recordar.** El botón **«Recordar inscripción (N)»** encola un correo a
quienes siguen pendientes y ya recibieron su credencial. **Enseña la lista
completa de destinatarios antes de enviar nada** y exige confirmar.

Es manual a propósito, y merece la pena entender por qué. Un barrido automático
mandaría el recordatorio a gente que sí se inscribió por su cuenta y a quien
nadie ha marcado todavía. Decirle a alguien que no está inscrito cuando sí lo
está cuesta más confianza que no decir nada.

**d) Moderar fotos** (pestaña «Fotos», solo admin). Muestra las pendientes,
más antigua primero, con **aprobar** o **quitar foto**. Hay un «aprobar todas
las visibles» que va de una en una a propósito: en paralelo, 300 llamadas
chocarían contra el límite de escritura de 30/min.

Quitar una foto **borra los objetos de Storage primero** y después cambia el
estado, nunca al revés —si se hiciera al revés y fallara el borrado, el panel
mostraría una foto retirada que sigue siendo legible—, sustituye el avatar por
una mascota y encola un correo avisando del cambio. **No toca el estado de
Bevy**: la inscripción es independiente de la foto y una retirada no debe
desmarcar a quien ya fue transcrito.

**Es irreversible**: los objetos se borran, no se archivan.

**e) Elegir por dónde salen los correos.** Un desplegable permite cambiar entre
**Gmail** (tope 350/día) y **Resend** (tope 90/día) sin desplegar nada. Se lee en
cada vuelta del drenador, así que si un proveedor falla en mitad del evento se
cambia y ya.

---

## 5. Los estados de una credencial

Cada registro lleva tres estados independientes. Que sean independientes es
intencionado: una foto retirada no debe alterar la inscripción, y un correo
fallido no dice nada de si la persona está o no en Bevy.

**Inscripción (`bevyStatus`)**
`pending` → `loaded` | `not_found` | `discarded`, y se puede volver a `pending`.

**Foto (`photoStatus`)**
`none` (eligió mascota) · `pending_review` (subió foto) · `approved` · `removed`.

**Correo (`emailStatus`)**
`queued` → `sending` → `sent`, o vuelta a `queued` con espera creciente, o
`failed` tras agotar 6 intentos.

### Cómo salen los correos

Nunca se envían en la propia petición. Un trabajo programado, `drainCredentialEmails`,
se ejecuta **cada 5 minutos** y va vaciando la cola:

- Toma cada documento **dentro de una transacción**, para que dos ejecuciones
  solapadas o un disparo manual no manden lo mismo dos veces.
- Si una ejecución se cae a medias, el documento queda «en vuelo»; un
  arrendamiento caducado (5 min) permite recuperarlo.
- Ante un fallo, reintenta con espera creciente; tras 6 intentos lo **aparca**
  como `failed` en vez de reintentar para siempre, y el panel ofrece un botón de
  reintento manual.
- Respeta un **presupuesto diario** por proveedor.
- Escribe **una sola entrada de auditoría por ejecución**: una por correo
  añadiría cientos de filas por evento y ahogaría el resto del registro.

Hay tres plantillas:

| Plantilla       | Asunto                              | Adjunta la tarjeta |
| --------------- | ----------------------------------- | ------------------ |
| `credential`    | «Tu credencial de …»                | Sí                 |
| `photo_removed` | «Actualizamos tu credencial — …»    | Sí                 |
| `reminder`      | «Te falta un paso para asistir a …» | **No**             |

---

## 6. Quién puede hacer qué

| Acción                                                        | Permiso                | Quién lo tiene                                      |
| ------------------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| Ver la lista                                                  | `roster:read`          | organizer; volunteer **solo en su evento**          |
| Marcar estado de Bevy, recordar, conciliar, reintentar correo | `credentials:operate`  | organizer (global); volunteer **solo en su evento** |
| Moderar fotos                                                 | `credentials:moderate` | **solo admin**                                      |
| Cambiar el proveedor de correo                                | `email:transport`      | solo admin                                          |

Dos matices que importan:

- Un **voluntario** no tiene permisos globales. Los suyos aplican únicamente
  dentro de los eventos donde esté asignado en `events/{slug}/staff/{uid}`, y
  dejan de aplicar cuando la asignación caduca.
- `credentials:moderate` **no está en ningún paquete de rol**. Solo lo tiene
  `admin`, porque quitar una foto es un juicio sobre qué aparece bajo la marca
  de GDG y además es irreversible. Eso también significa que hoy **no se puede
  delegar** la moderación sin dar admin.

Ocultar un botón en la interfaz no protege nada: la puerta real es la API, y
detrás están además las reglas de Firestore y Storage.

---

## 7. Decisiones que sorprenden, y por qué son así

**Se permiten DNI duplicados.** Bloquearlos parece lo obvio, pero dejaría que
cualquiera impidiese inscribirse a una persona real simplemente reclamando su
número primero. Se guardan y se muestran como conflicto en el panel para que un
humano decida.

**El límite de peticiones va por IP, no por DNI.** Por lo mismo. El coste
asumido es que una universidad o una oficina con IP compartida pueden toparse
con el tope de 8/hora; por eso el mensaje de error da una dirección de contacto.

**La moderación es retirada posterior, no filtro previo.** La tarjeta se compone
en el dispositivo y se descarga antes de enviarse: una foto inadecuada ya existe
en ese teléfono, hagamos lo que hagamos. Lo que la moderación controla es qué
almacena y qué reenvía GDG Ica, que es lo que promete la política de privacidad.

**El DNI nunca entra en el CSV de Bevy.** Bevy no tiene ese campo, y el valor del
DNI es verificar identidad en la puerta. Exportarlo a una plataforma de terceros
lo esparciría sin ganar nada.

**El QR de la tarjeta se genera al construir el sitio.** Se pasa al navegador
como `data:` URL en vez de cargarlo desde otro dominio: una imagen de otro origen
contaminaría el canvas y haría fallar la exportación de la tarjeta.

**La página de créditos es una obligación legal, no cortesía.** Las mascotas se
usan bajo licencias que exigen reconocer autoría allí donde aparezca la obra.
Si se toca ese conjunto, la atribución tiene que seguirlo.

---

## 8. Estado actual y cosas a vigilar

- **App Check está en modo observación, no exigiendo.** Los dos únicos envíos
  reales registrados llegaron **sin** token. Activar la exigencia hoy rechazaría
  el 100% de las inscripciones. La causa no es la clave de reCAPTCHA (funciona en
  el dominio), ni el registro de App Check, ni la CSP: está en la integración del
  cliente, y el código se traga el error en silencio. **No activarlo hasta que los
  registros muestren tráfico real con token.**
- **La conciliación empareja solo por correo.** Quien se inscriba en Bevy con una
  dirección distinta a la que nos dio no se empareja solo.
- **El cupo son 700**, y se comprueba dentro de la transacción, así que dos
  peticiones simultáneas no pueden pasarse de largo.
- **Los nombres de las columnas de encuesta del CSV están sin confirmar**: Bevy
  las nombra según el texto exacto de cada pregunta y hay que exportar la
  plantilla real para verificarlo. Están todas juntas en una constante para que
  corregirlo sea una línea.

### Dónde está cada cosa

| Qué                      | Dónde                                                                             |
| ------------------------ | --------------------------------------------------------------------------------- |
| Página pública           | `src/pages/events/[slug]/credencial.astro`                                        |
| Isla y formulario        | `src/components/react/credential/`                                                |
| Dibujo de la tarjeta     | `src/components/react/credential/renderCredential.ts`                             |
| Panel de administración  | `src/components/react/admin/credentials/`                                         |
| API                      | `functions/src/handlers/credentials.ts`                                           |
| Validación               | `functions/src/schemas/credentials.ts`                                            |
| Cola de correo           | `functions/src/services/credentialQueue.ts` y `triggers/drainCredentialEmails.ts` |
| Conciliación             | `functions/src/services/credentialReconcile.ts`                                   |
| Configuración del evento | `events/<slug>.json` en `gdg-ica-data`                                            |
