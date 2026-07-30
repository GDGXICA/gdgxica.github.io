/**
 * Registro cerrado de acciones de auditoría.
 *
 * Existe para que `action` deje de ser `string`. Con una cadena libre, un typo
 * —`user.role.chnage`— compilaba, se escribía y solo se descubría el día que
 * alguien filtrase por la acción correcta y no encontrase nada: justo cuando
 * hace falta el registro. Aquí un typo no compila.
 *
 * Este archivo NO importa nada a propósito. `auditTypes` lo importa y
 * `securityAudit` importa de `auditTypes`, así que cualquier import aquí
 * cerraría el ciclo. Es también la razón de que los nombres de los eventos de
 * seguridad vivan en esta lista y no se deriven del catálogo de
 * `securityAudit`: la dependencia tiene que ir en un solo sentido.
 *
 * Añadir una acción es añadirla aquí. Si el compilador te trajo a este archivo,
 * la pregunta que toca no es "¿cómo lo callo?" sino si esa acción ya existe con
 * otro nombre — dos nombres para lo mismo parten el registro en dos y ninguno
 * de los dos filtros lo enseña completo.
 */

/**
 * Acciones de dominio: alguien hizo algo y quedó constancia.
 *
 * El prefijo determina la categoría (ver `deriveCategory`), así que el nombre
 * no es decorativo: `event.staff.assign` cae en `access` y no en `content`
 * porque asignar staff concede permisos.
 */
export const AUDIT_ACTIONS = [
  // Acceso: roles, permisos, invitaciones, solicitudes, staff por evento
  "user.register",
  "user.role.change",
  "user.status.change",
  "user.grants.change",
  "access.request.create",
  "access.request.approve",
  "access.request.reject",
  "access.invitation.create",
  "access.invitation.redeem",
  "access.invitation.revoke",
  "event.staff.assign",
  "event.staff.remove",

  // Contenido publicado en el repo de datos
  "event.create",
  "event.update",
  "event.delete",
  "speaker.create",
  "speaker.update",
  "speaker.delete",
  "sponsor.create",
  "sponsor.update",
  "sponsor.delete",
  "team.create",
  "team.update",
  "team.delete",
  "location.create",
  "location.update",
  "location.delete",
  "form.create",
  "form.update",
  "form.delete",
  "stats.update",
  "proposal.create",
  "proposal.update",
  "proposal.review",
  "proposal.publish",

  // Operaciones
  "site.rebuild",
  "settings.email_transport",
  "certificate.send",
  "checkin.import",
  "credential.create",
  "credential.image",
  "credential.bevy_status",
  "credential.moderate_photo",
  "credential.email_retry",
  "credential.reminders",
  "credential.reconcile",
  "credential_email.drain",

  // Lecturas sensibles. Son las ÚNICAS lecturas que se auditan: un GET normal
  // no deja fila, porque una por vista de página ahoga el registro y el visor
  // solo admite un filtro a la vez.
  //
  // Falta a propósito el roster de asistentes y las credenciales con datos
  // personales: el panel los lee DIRECTAMENTE de Firestore, acotado por las
  // reglas, sin pasar por la API. No hay endpoint donde engancharse, así que
  // cubrirlos exigiría instrumentar el lado de Firestore.
  "read.audit_log",
  "read.users",
  "read.form_responses",

  // Minijuegos
  "minigame_template.create",
  "minigame_template.update",
  "minigame_template.delete",
  "minigame_instance.attach",
  "minigame_instance.delete",
  "minigame_instance.quiz.advance",
  "minigame_instance.roulette.spin",
  "minigame_instance.bingo.draw",
  "minigame_participant.join",
  "minigame_participant.bingo.claim",
  "minigame_word.hide",
  "minigame_word.unhide",
] as const;

/**
 * Eventos de seguridad. `securityAudit.ts` constriñe su catálogo a esta lista,
 * así que un evento nuevo tiene que declararse aquí antes de poder emitirse.
 */
export const SECURITY_ACTIONS = [
  "security.auth.invalid_token",
  "security.appcheck.missing",
  "security.permission.denied",
  "security.account.suspended_access",
  "security.invitation.redeem_failed",
  "security.user.unregistered",
  "security.ratelimit.exceeded",
  "security.audit.throttled",
] as const;

export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

/**
 * El estado del minijuego forma parte del nombre de la acción, para poder
 * filtrar "cuándo se abrió" sin leer los detalles de cada fila.
 *
 * Un miembro de literal de plantilla en vez de enumerar los tres: `state` es
 * `z.enum(["scheduled","live","closed"])` en `schemas/index.ts`, así que TS ya
 * infiere exactamente esa union y añadir un estado al esquema rompe aquí, que
 * es lo que se quiere.
 */
type MinigameStateAction =
  `minigame_instance.state.${"scheduled" | "live" | "closed"}`;

/**
 * Filas de la red de seguridad automática: la acción lleva el patrón de ruta
 * resuelto en tiempo de ejecución, así que no se puede enumerar.
 *
 * Es el único hueco abierto de la union, y lo es a propósito: estas filas
 * significan "un handler mutó algo sin decir qué", y llevan
 * `synthesized: true` para que se distingan de una acción de verdad.
 */
type SynthesizedAction = `http.${string}`;

export type AuditAction =
  | (typeof AUDIT_ACTIONS)[number]
  | SecurityAction
  | MinigameStateAction
  | SynthesizedAction;
