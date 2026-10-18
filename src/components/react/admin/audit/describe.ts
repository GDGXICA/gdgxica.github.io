import { ROLE_LABELS, type Role } from "@/lib/permissions";

const EXACT: Record<string, string> = {
  "user.role.change": "cambió el rol de",
  "user.status.change": "cambió el estado de",
  "user.grants.change": "cambió los permisos puntuales de",
  "user.register": "se registró",
  "event.staff.assign": "asignó al staff",
  "event.staff.remove": "quitó del staff",
  "access.request.create": "solicitó acceso",
  "access.request.approve": "aprobó la solicitud de acceso de",
  "access.request.reject": "rechazó la solicitud de acceso de",
  "access.invitation.create": "invitó a",
  "access.invitation.revoke": "revocó la invitación de",
  "access.invitation.redeem": "aceptó una invitación",
  "proposal.publish": "publicó la propuesta",
  "proposal.review": "revisó la propuesta",
  "site.rebuild": "reconstruyó el sitio",
  "checkin.mark": "marcó asistencia de",
  "credential.reminders": "envió recordatorios de credencial",
  "credential.bevy_status": "actualizó el estado en Bevy de",
  "mural.photo.upload": "subió una foto al mural",
  "mural.photo.review": "moderó una foto del mural",
  "mural.photo.takedown": "retiró una foto del mural",
  "mural.photo.removal_request": "pidió retirar una foto del mural",
  "mural.uploader.block": "bloqueó a quien subía fotos",
  "mural.settings.update": "cambió la configuración del mural",
  "settings.email_transport": "cambió el envío de correos",
  "stats.update": "actualizó las cifras del sitio",
  "post.image.upload": "subió una imagen para el foro",
  "read.users": "consultó el directorio de usuarios",
  "read.audit_log": "consultó la auditoría",
  "read.form_responses": "consultó respuestas de un formulario",
};

const RESOURCE: Record<string, string> = {
  event: "el evento",
  post: "el post",
  speaker: "el speaker",
  sponsor: "el sponsor",
  team: "a un miembro del equipo",
  proposal: "la propuesta",
  location: "la ubicación",
  form: "el formulario",
  minigame_template: "la plantilla de minijuego",
  minigame_instance: "el minijuego",
};

const VERB: Record<string, string> = {
  create: "creó",
  update: "editó",
  delete: "eliminó",
};

const SECURITY: Record<string, string> = {
  "security.permission.denied": "Intento sin permiso",
  "security.auth.invalid_token": "Sesión inválida",
  "security.ratelimit.exceeded": "Demasiadas solicitudes",
  "security.user.unregistered": "Cuenta sin registrar",
  "security.account.suspended_access": "Acceso de una cuenta suspendida",
  "security.invitation.redeem_failed": "Invitación rechazada",
  "security.appcheck.missing": "Solicitud sin verificación de app",
  "security.audit.throttled": "Registro de auditoría limitado",
};

export interface Described {
  kind: "sentence" | "security" | "raw";
  text: string;
}

export function describeAction(action: string): Described {
  if (SECURITY[action]) return { kind: "security", text: SECURITY[action] };
  if (EXACT[action]) return { kind: "sentence", text: EXACT[action] };

  const parts = action.split(".");
  const verb = VERB[parts[parts.length - 1]];
  const resource = RESOURCE[parts.slice(0, -1).join(".")];
  if (verb && resource)
    return { kind: "sentence", text: `${verb} ${resource}` };

  return { kind: "raw", text: action };
}

function roleLabel(value: unknown): string {
  return typeof value === "string"
    ? (ROLE_LABELS[value as Role] ?? value)
    : String(value);
}

const STATUS: Record<string, string> = {
  active: "activo",
  suspended: "suspendido",
};

export function describeChange(
  details: Record<string, unknown> | undefined
): string | null {
  if (!details) return null;
  if ("newRole" in details) {
    return details.previousRole
      ? `de ${roleLabel(details.previousRole)} a ${roleLabel(details.newRole)}`
      : `a ${roleLabel(details.newRole)}`;
  }
  if ("newStatus" in details) {
    const next = STATUS[String(details.newStatus)] ?? String(details.newStatus);
    const prev = details.previousStatus
      ? (STATUS[String(details.previousStatus)] ??
        String(details.previousStatus))
      : null;
    return prev ? `de ${prev} a ${next}` : `a ${next}`;
  }
  return null;
}
