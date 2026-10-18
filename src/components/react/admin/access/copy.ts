export const INVALID_INVITATION =
  "Esta invitación no es válida, caducó o ya se usó. Si crees que es un error, pide a quien te invitó que te envíe una nueva.";

const EXACT: Record<string, string> = {
  "A verified email address is required":
    "Tu cuenta de Google no tiene el correo verificado. Verifícalo y vuelve a intentarlo.",
  "Your account already has everything this role grants":
    "Tu cuenta ya tiene todo lo que da ese rol. Elige otro o entra al panel.",
  "Your request was already approved":
    "Tu solicitud ya fue aprobada. Vuelve a cargar la página para entrar.",
  "Cannot review your own request":
    "No puedes decidir sobre tu propia solicitud. Pídele a otra persona que la revise.",
  "Request not found": "Esa solicitud ya no existe. Vuelve a cargar la lista.",
  "Request was already reviewed":
    "Otra persona ya decidió sobre esta solicitud. Vuelve a cargar la lista.",
  "Cannot grant a role that exceeds your own permissions":
    "No puedes otorgar un rol con más permisos que el tuyo.",
  "User account not found":
    "No se encontró la cuenta. Pide que vuelva a iniciar sesión en el panel y reinténtalo.",
  "Cannot manage a user whose role exceeds your own permissions":
    "Esa cuenta ya tiene más permisos que la tuya; no puedes cambiar su rol.",
  "Cannot demote the last active admin":
    "Es el único administrador activo: aprobarla le quitaría ese rol. Asciende antes a otra persona.",
  "A valid email is required": "Escribe un correo válido.",
  "Cannot invite to a role that exceeds your own permissions":
    "No puedes invitar a un rol con más permisos que el tuyo.",
  "Invitation created but the email could not be sent":
    "La invitación se creó, pero el correo no salió. Revócala y vuelve a enviarla.",
  "Invitation not found":
    "Esa invitación ya no existe. Vuelve a cargar la lista.",
  "Invitation was already used":
    "Esa invitación ya se aceptó; no se puede revocar.",
  "Invitation was already revoked": "Esa invitación ya estaba revocada.",
  "A token is required": "Pega el código que te llegó por correo.",
  "Invitation is invalid, expired or already used": INVALID_INVITATION,
  "Not authenticated": "Tu sesión se cerró. Vuelve a iniciar sesión.",
};

const PREFIXES: [string, string][] = [
  ["requestedRole must be one of", "Elige uno de los roles de la lista."],
  ["role must be one of", "Elige uno de los roles de la lista."],
  ["motivo is required", "Cuéntanos el motivo (hasta 1000 caracteres)."],
  ["A note is required", "Escribe una nota antes de decidir."],
];

export function accessError(error: string | undefined, fallback: string) {
  if (!error || error === "An internal error occurred") return fallback;
  if (EXACT[error]) return EXACT[error];
  const prefixed = PREFIXES.find(([prefix]) => error.startsWith(prefix));
  if (prefixed) return prefixed[1];
  if (/^Error \d+$/.test(error)) return fallback;
  return error;
}

export function redeemError(error: string | undefined) {
  return accessError(
    error,
    "No se pudo aceptar la invitación. Inténtalo de nuevo en un momento."
  );
}

const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function formatWhen(ms: number | null, now = Date.now()): string {
  if (ms === null) return "sin fecha";
  const minutes = Math.round((ms - now) / 60_000);
  if (Math.abs(minutes) < 1) return "ahora";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, "day");
  return new Date(ms).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type LinkPart = { text: string; href?: string };

export function splitLinks(value: string): LinkPart[] {
  return value
    .split(/(\s+|,\s*)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      /^https?:\/\/[^\s<>"']+$/i.test(part)
        ? { text: part, href: part }
        : { text: part }
    );
}
