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

- **`audit_log`** conserva la acción `credential.create` con el
  `credentialId`, el correlativo y la letra de grupo — **nunca DNI, nombre ni
  correo**. Es trazabilidad operativa sin datos personales, así que no entra
  en los plazos de arriba.
- **`credential_email_budget`** solo cuenta envíos por día. No contiene
  ninguna referencia a personas.

## Después de ejecutarlo

Anota en el canal del equipo qué evento se limpió, con qué fecha y quién lo
hizo. Sin ese registro no hay forma de demostrar que el plazo se cumplió, que
es justo lo que un requerimiento bajo la Ley N.º 29733 pediría.
