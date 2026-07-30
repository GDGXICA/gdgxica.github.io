# Runbook: retención de datos de credenciales

La [política de privacidad](../src/pages/privacy-policy/index.astro) promete
dos plazos concretos:

- **Datos de inscripción**: hasta **12 meses** después de la fecha del evento.
- **Fotografías**: hasta **90 días** después del evento, o antes si la persona
  lo solicita.

**Nada los ejecuta automáticamente.** Este documento es lo que los hace
cumplibles. Si nadie lo corre, la política dice algo que no ocurre — que es
peor que no haberlo prometido.

> Se decidió borrado manual documentado en vez de una función programada.
> Automatizarlo es una tarea pequeña (`onSchedule` diario recorriendo
> `collectionGroup("credentials")`) y sigue siendo la opción recomendable si
> el runbook se olvida una vez.

## Cuándo

| Momento                    | Acción                                        |
| -------------------------- | --------------------------------------------- |
| Evento + 90 días           | Borrar fotografías y tarjetas compuestas      |
| Evento + 12 meses          | Borrar los documentos de credencial completos |
| Cuando alguien lo solicite | Borrado individual, sin esperar plazo         |

Agenda ambos recordatorios en el calendario del equipo el mismo día que se
cierra el evento. Es la única parte del procedimiento que depende de la
memoria de alguien.

## Requisitos

- `gcloud` autenticado con una cuenta con acceso al proyecto `appgdgica`.
- Permisos de administrador en Firebase.

Trabaja siempre con el slug del evento a mano (`devfest-2026`, etc.).

## 1. Fotografías y tarjetas, a los 90 días

Las imágenes viven en Cloud Storage bajo un prefijo por evento:

```
credentials/{slug}/{credentialId}/photo.jpg
credentials/{slug}/{credentialId}/credential.jpg
```

Primero **lista** lo que se va a borrar y revísalo:

```bash
gcloud storage ls --recursive \
  "gs://appgdgica.firebasestorage.app/credentials/<slug>/**" \
  --project=appgdgica
```

Cuando el listado sea el esperado:

```bash
gcloud storage rm --recursive \
  "gs://appgdgica.firebasestorage.app/credentials/<slug>/" \
  --project=appgdgica
```

Después limpia las referencias en Firestore, o el panel intentará resolver
rutas que ya no existen. Desde la consola de Firebase, sobre cada documento
de `events/<slug>/credentials`, deja en `null`:

- `photoPath`
- `credentialImagePath`

y pon `photoStatus` en `"removed"`.

> El panel de moderación ya tolera una imagen ausente: `useImageUrl` cae a un
> marcador en vez de romper la grilla. Aun así conviene limpiar los campos,
> porque un `photoPath` que apunta a nada es un dato falso.

## 2. Datos de inscripción, a los 12 meses

Borra la subcolección completa del evento:

```bash
firebase firestore:delete "events/<slug>/credentials" \
  --recursive --project appgdgica
```

Y el contador, que ya no significa nada sin las credenciales:

```bash
firebase firestore:delete "events/<slug>/credentialMeta" \
  --recursive --project appgdgica
```

**No borres** `events/<slug>/roster`: eso es el registro de asistencia
importado de Bevy y responde a otro plazo. Si la conciliación estampó DNI en
esas filas, límpialos por separado dejando en `null` los campos `dni`,
`credentialId`, `dniVerified`, `dniVerifiedAt`, `dniMatchedName` y
`dniMatchScore`.

## 3. Borrado a solicitud (derechos ARCO)

Cualquier persona puede pedir la eliminación de sus datos escribiendo a
`aalvaropc@gmail.com`. La política promete respuesta en **20 días hábiles**.

1. Localiza la credencial en `/admin/credentials?slug=<slug>` buscando por
   correo o DNI.
2. Anota el `credentialId`.
3. Borra sus imágenes:
   ```bash
   gcloud storage rm --recursive \
     "gs://appgdgica.firebasestorage.app/credentials/<slug>/<credentialId>/" \
     --project=appgdgica
   ```
4. Borra el documento `events/<slug>/credentials/<credentialId>` desde la
   consola de Firebase.
5. Responde a la solicitud confirmando qué se borró y qué no.

**Qué no se puede borrar, y hay que decirlo:** la credencial se compone en el
dispositivo de la persona. Una vez descargada o publicada, esa copia está
fuera de nuestro alcance. La política ya lo dice con todas sus letras; la
respuesta a la solicitud debería repetirlo en vez de dar a entender un retiro
total.

## Lo que este procedimiento deja fuera a propósito

- **`credential_email_budget`** solo cuenta envíos por día. No contiene
  ninguna referencia a personas.

## `audit_log`: qué guarda y por qué no sigue estos plazos

De la credencial en sí, `audit_log` conserva la acción `credential.create` con
el `credentialId`, el correlativo y la letra de grupo — **nunca DNI, nombre ni
correo**. Eso sigue siendo cierto y es deliberado: la colección la lee cualquiera
con el permiso `audit:read`, que es más amplio que el permiso para ver el roster
con datos personales, así que el handler los omite a propósito.

Lo que **sí** guarda de quien opera el panel, desde que se amplió la auditoría:

| Campo               | Qué es                                                        |
| ------------------- | ------------------------------------------------------------- |
| `performedBy`       | uid de Firebase de quien ejecutó la acción                    |
| `actor.email`       | correo de la cuenta con la que se actuó                       |
| `actor.role`        | rol con el que se actuó, congelado en ese momento             |
| `context.ipPrefix`  | **prefijo de red**, no la dirección: /24 en IPv4, /48 en IPv6 |
| `context.userAgent` | cadena del navegador, saneada y cortada a 200 caracteres      |
| `context.route`     | patrón de la ruta (`/api/users/:uid/role`)                    |
| `context.requestId` | identificador para correlacionar con Cloud Logging            |

Esto es un cambio respecto a lo que este documento decía antes. `audit_log` ya
no es "trazabilidad sin datos personales": el correo identifica a una persona, y
una dirección IP es dato personal bajo la Ley N.º 29733. Se guarda solo el
prefijo de red precisamente para quedarse en lo que hace falta —correlacionar
"desde esta red se hicieron estas cuarenta cosas"— sin conservar un dato que
señale a un individuo concreto. La dirección completa existe únicamente en Cloud
Logging, que tiene su propio control de acceso y su propia retención.

**Plazo: 24 meses.** Más largo que los 12 de los datos de inscripción, y a
propósito: un registro de auditoría sirve para reconstruir qué pasó cuando el
problema se descubre tarde, y los abusos de permisos se descubren tarde por
definición. Borrarlo al año dejaría sin rastro justo el caso que justifica
tenerlo.

**Qué contiene sobre asistentes**: nada más que el `credentialId`. Las personas
que sacan una credencial no operan el panel, así que no generan entradas con
correo ni IP. Una solicitud de borrado de un asistente **no** requiere tocar
`audit_log`; el procedimiento de arriba está completo tal y como está.

**Qué contiene sobre quien opera el panel**: lo de la tabla. Si una de esas
personas pide el borrado de sus datos, hay que decirle con claridad que el
registro de auditoría no se borra a petición mientras esté dentro de su plazo:
es la constancia de decisiones que afectaron a otras personas —conceder
permisos, publicar contenido, exportar respuestas de formularios— y borrarlo a
petición del sujeto lo convertiría en un registro que sus propios sujetos
pueden editar, que es lo mismo que no tener registro. Ese es el argumento que
hay que dar, no un "no se puede".

## Después de ejecutarlo

Anota en el canal del equipo qué evento se limpió, con qué fecha y quién lo
hizo. Sin ese registro no hay forma de demostrar que el plazo se cumplió, que
es justo lo que un requerimiento bajo la Ley N.º 29733 pediría.
