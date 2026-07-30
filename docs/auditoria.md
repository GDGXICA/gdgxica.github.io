# Runbook: el registro de auditoría

Qué se registra, cómo investigar un incidente con él, y los tres pasos manuales
que el código no puede dar por su cuenta.

## Qué contiene

La colección `audit_log` guarda una fila por operación. Cada fila lleva:

| Campo                     | Qué es                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `action`                  | del registro cerrado de `functions/src/utils/auditActions.ts`     |
| `performedBy` · `actor`   | uid, correo, rol con el que se actuó y alcance                    |
| `targetId` · `targetType` | sobre qué se actuó                                                |
| `outcome`                 | `success`, `denied` o `failure`                                   |
| `severity`                | `info`, `notice`, `warning`, `critical`                           |
| `category`                | `content`, `access`, `operations`, `minigame`, `read`, `security` |
| `context`                 | `requestId`, `method`, patrón de ruta, prefijo de red, user-agent |
| `details`                 | libre, propio de cada acción                                      |
| `synthesized`             | `true` si la escribió la red de seguridad, no un handler          |

**Lo que NO contiene**: la dirección IP completa (solo el prefijo /24 o /48), ni
DNI, nombre o correo de asistentes. Los plazos y el motivo están en
[retención de datos](./retencion-de-datos.md).

### Tres cosas que conviene saber antes de fiarse del registro

1. **Los cambios de acceso son atómicos; el resto, no.** Rol, estado, grants,
   staff por evento, alta de cuenta y canje de invitación escriben su fila en el
   mismo batch o transacción que la mutación: o quedan las dos o no queda
   ninguna. Las demás acciones usan `writeAuditLog`, que registra el fallo y
   deja seguir — una fila perdida ahí es posible, aunque quede en Cloud Logging.

2. **Cloud Logging tiene MÁS que Firestore, no menos.** Cada fila se espeja allí
   con la IP completa, y los eventos de seguridad de nivel `log-only` (token
   inválido, App Check ausente) **solo** existen ahí. Si el panel no explica algo,
   el siguiente sitio donde mirar es Cloud Logging, no la conclusión de que no
   pasó.

3. **Los contadores son por instancia.** El presupuesto de escrituras de
   seguridad (30/min) y la agrupación de lecturas repetidas (1/hora) viven en
   memoria, igual que los rate limiters. Con varias instancias activas el
   número real de filas puede ser mayor que el nominal. No es un fallo: un
   contador compartido costaría una lectura y una escritura por denegación.

## Investigar un incidente

### 1. Empieza por lo notable

En `/admin/audit`, el atajo **Notable** (`?severity=notable`) trae todo lo
`warning` y `critical`. **Seguridad** (`?category=security`) trae solo
denegaciones, canjes fallidos y throttling.

Señales por orden de gravedad:

- `security.account.suspended_access` — una cuenta suspendida con un token
  todavía vivo intentando operar. Es la señal más limpia de una cuenta
  comprometida o de alguien que ya no debería estar.
- `security.invitation.redeem_failed` — con `details.reason`. Un `no_match`
  repetido desde la misma red es alguien probando tokens; un `race_already_used`
  es un enlace compartido.
- `user.role.change` / `user.grants.change` que no reconozcas.
- Filas con `synthesized: true` — hay código mutando sin declarar qué. No es un
  ataque: es un hueco de instrumentación que hay que cerrar.
- `security.audit.throttled` — se está suprimiendo registro. Lo que falta está
  en Cloud Logging.

### 2. Sigue el hilo por la red y por la persona

El prefijo de red contesta "qué más hizo esta red":

```
/admin/audit?context.ipPrefix=181.65.42.0/24
```

Y por persona: `?performedBy=<uid>`. Solo se admite **un filtro a la vez** —
cada uno cuesta un índice compuesto, y la categoría sola ya da la vista que
hace falta.

### 3. Cruza con Cloud Logging por el `requestId`

Cada fila lleva un `requestId`, visible bajo el detalle en el panel y devuelto
en la cabecera `X-Request-Id` de cada respuesta. Con él:

```bash
gcloud logging read \
  'jsonPayload.requestId="<request-id>"' \
  --project=appgdgica --limit=50 --freshness=30d
```

Eso trae la IP completa, los eventos `log-only` de esa misma petición, y
cualquier error no capturado.

Para ver todo el espejo de auditoría de un periodo:

```bash
gcloud logging read \
  'jsonPayload.message="audit" AND jsonPayload.severity="critical"' \
  --project=appgdgica --limit=100 --freshness=7d
```

### 4. Si hay que cortar

`PATCH /api/users/:uid/status` con `status: "suspended"` desde `/admin/users`.
La suspensión corta todos los permisos de golpe y surte efecto en la siguiente
petición, porque el doc de usuario se lee en cada una. **No** hace falta deshacer
rol y grants uno a uno.

Ojo: suspender no invalida el ID token, que vive hasta una hora. Lo que hace es
que ninguna petición pase el middleware — y cada intento posterior queda como
`security.account.suspended_access`, que es justamente la señal que se quiere.

## Alertas

`functions/src/triggers/auditAlerts.ts` corre cada hora, busca lo `critical`
desde su marca de agua (`settings/auditAlerts`) y manda un correo a la dirección
de contacto. Un solo correo con todo lo acumulado, no uno por evento.

Si las alertas dejan de llegar, el fallo está en Cloud Logging:

```bash
gcloud logging read 'jsonPayload.message="audit.alert.failed"' \
  --project=appgdgica --limit=20 --freshness=7d
```

La marca de agua avanza aunque el correo falle. Es deliberado: reintentar
dejando la ventana abierta significaría que un problema persistente de SMTP
acumula filas y manda un correo enorme al arreglarse. El registro sigue
completo en el panel.

## Copias

`functions/src/triggers/exportAudit.ts` exporta `audit_log` a GCS el día 1 de
cada mes. Existe porque las reglas cierran la colección a los clientes pero el
Admin SDK las salta: quien comprometa el panel puede borrar filas.

**Requiere dos pasos manuales una vez.** Sin ellos el export falla con un 403
que queda en el log:

```bash
# 1. El bucket destino
gcloud storage buckets create gs://appgdgica-audit-backups \
  --project=appgdgica --location=southamerica-west1

# 2. Permiso de export para la cuenta de servicio de las funciones
gcloud projects add-iam-policy-binding appgdgica \
  --member="serviceAccount:appgdgica@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"
```

Comprobar que salió:

```bash
gcloud logging read 'jsonPayload.message="audit.export.started"' \
  --project=appgdgica --limit=5 --freshness=40d
```

---

## Los tres pasos manuales

### 1. Log bucket bloqueado — IRREVERSIBLE

Es el control de inmutabilidad **real**, y el único que resiste el escenario que
motiva tener uno: una cuenta comprometida con permisos de administración.

La cuenta de servicio de la función no puede borrar sus propios logs, y eso ya
es útil. Pero un **owner** del proyecto sí puede (`gcloud logging logs delete`,
o borrando el bucket). Lo que cierra eso es un bucket con retención bloqueada:
una vez bloqueado **no se puede desbloquear, ni acortar el plazo, ni borrar el
bucket** — ni tú, ni un owner, ni el soporte de Google.

> **Leer antes de ejecutar:** el bloqueo es permanente. Vas a pagar el
> almacenamiento de esos logs durante todo el plazo que fijes, sin poder
> cancelarlo. Empieza con un plazo que estés dispuesto a sostener; 400 días
> cubre el año fiscal y algo de margen.

```bash
# Crear el bucket de logs con retención
gcloud logging buckets create audit-locked \
  --location=global --retention-days=400 \
  --description="Espejo de auditoría, retención bloqueada" \
  --project=appgdgica

# Enrutar solo el espejo de auditoría y los eventos de seguridad
gcloud logging sinks create audit-mirror \
  logging.googleapis.com/projects/appgdgica/locations/global/buckets/audit-locked \
  --log-filter='jsonPayload.message="audit" OR jsonPayload.message=~"^security\."' \
  --project=appgdgica

# Y SOLO cuando lo anterior esté verificado y funcionando:
gcloud logging buckets update audit-locked \
  --location=global --locked --project=appgdgica
```

Verifica que el sink recibe datos **antes** de bloquear. Un bucket bloqueado y
vacío no se puede borrar, y habrías fijado un plazo irrevocable sobre nada.

### 2. Activar App Check — solo después de mirar los logs

`settings/appcheck.enforce` está en `false`. Activarlo cierra los endpoints
públicos de credenciales a quien no traiga un token válido de App Check.

**Primero comprueba que los clientes reales lo mandan.** `src/lib/api.ts` omite
la cabecera en silencio cuando `getAppCheckToken()` devuelve `null`, así que si
reCAPTCHA no funciona para tus asistentes, activarlo los deja fuera sin aviso —
y descubrirlo en mitad de un evento es el peor momento posible.

```bash
gcloud logging read 'jsonPayload.message="security.appcheck.missing"' \
  --project=appgdgica --limit=100 --freshness=7d
```

Lo que buscas es que ese recuento sea **bajo y estable** en un periodo con
tráfico real de un evento. Si es alto, hay clientes legítimos sin cabecera y
activarlo los rechazaría.

Cuando el número convenza, poner `enforce: true` en el documento
`settings/appcheck` desde la consola de Firebase.

**Interruptor de emergencia:** volver a poner `enforce: false` desde la consola.
Surte efecto sin desplegar. Está escrito aquí porque es la razón por la que
activarlo es aceptable — pero ojo con el punto siguiente.

> Desde el arreglo de la caché, un error transitorio de lectura de Firestore
> **conserva** el último valor conocido en vez de abrir el paso. Eso solo afecta
> a peticiones que ya llegaban sin token válido —un token válido no lee el
> ajuste—, así que no toca a los clientes legítimos. Pero significa que el
> interruptor de emergencia necesita que Firestore sea legible; si no lo es, el
> flujo de credenciales está roto de todas formas, porque también escribe ahí.

### 3. Enviar las invitaciones

Este runbook existe para poder mandarlas con red debajo. Antes de la primera:

- [ ] `pnpm test` en `functions/` y `pnpm test:rules` en la raíz, en verde.
- [ ] Un cambio de rol de prueba aparece en `/admin/audit` con `requestId`,
      `ipPrefix` y `actor.role`.
- [ ] Un canje con un token inventado deja `security.invitation.redeem_failed`
      con el motivo real, mientras la respuesta sigue siendo el mensaje opaco.
- [ ] El correo de alerta llega tras un cambio de rol de prueba.
- [ ] Los pasos 1 y 2 hechos, o decididos a conciencia para más tarde.

Los permisos de una invitación no son reversibles hacia atrás en el tiempo: lo
que alguien vea mientras tiene acceso, ya lo vio. El registro sirve para saber
qué pasó, no para deshacerlo.
