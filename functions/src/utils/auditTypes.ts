import type { FieldValue } from "firebase-admin/firestore";
import type { AuditAction } from "./auditActions";

/**
 * Forma del registro de auditoría.
 *
 * Todo lo que se añadió al ampliar la auditoría es OPCIONAL a propósito: hace
 * que el tipo sea un superconjunto estricto de lo que ya escribían los call
 * sites que existían, así que ninguno tuvo que cambiar para que esto
 * compilara. La alternativa —exigir los campos nuevos de golpe— habría
 * obligado a tocar cincuenta y dos sitios y sus tests en el mismo commit que
 * cambia la integridad del registro, que es justo el commit que uno quiere
 * poder revisar línea a línea.
 */

/**
 * Si la acción se llevó a cabo, se rechazó por permisos, o falló por un error.
 * Sin esto el registro solo contaba lo que salió bien, y un log que únicamente
 * guarda los éxitos no sirve para investigar un abuso: lo que delata a quien
 * está probando puertas es la ráfaga de intentos denegados.
 */
export type AuditOutcome = "success" | "denied" | "failure";

/** Alineado con los niveles de Cloud Logging, para que el espejo sea directo. */
export type AuditSeverity = "info" | "notice" | "warning" | "critical";

/**
 * Lo que alguien querría revisar de una sentada: el filtro `notable` del visor
 * y lo que dispara un aviso por correo.
 *
 * Vive aquí y no en `handlers/audit.ts` porque el visor y las alertas tienen
 * que coincidir. Si el correo avisara de menos de lo que el panel resalta, el
 * enlace del propio correo llevaría a una lista más larga que la que anuncia.
 *
 * Se resuelve con un `in` sobre el campo que ya tiene índice compuesto con
 * `timestamp`. La alternativa —una desigualdad `severity >= "warning"`— no
 * sirve: Firestore exige que el primer `orderBy` sea el campo de la
 * desigualdad, y aquí el orden tiene que ser por `timestamp` o el registro
 * deja de leerse como una cronología.
 */
export const NOTABLE_SEVERITIES: readonly AuditSeverity[] = [
  "warning",
  "critical",
];

/**
 * Agrupación de primer nivel. Existe porque Firestore no sabe filtrar por
 * prefijo de cadena: sin un campo propio, "enséñame solo lo de seguridad" no
 * se puede consultar, y el visor solo admite un filtro a la vez porque cada
 * uno cuesta un índice compuesto.
 */
export type AuditCategory =
  | "content" // events, speakers, sponsors, team, stats, locations, forms
  | "access" // roles, grants, status, invitaciones, solicitudes, staff
  | "operations" // rebuild, certificados, check-in, credenciales, correo
  | "minigame"
  | "read" // lecturas sensibles auditadas
  | "security"; // denegaciones, canjes fallidos, throttling

export interface AuditContext {
  /**
   * Ata entre sí todo lo que ocurrió en una misma petición, y ata la fila de
   * Firestore con su línea en Cloud Logging. Es lo que permite pasar de "hubo
   * un cambio de rol raro" a "y en la misma petición se denegaron otras tres
   * cosas".
   */
  requestId: string;
  method: string;
  /**
   * El PATRÓN de la ruta (`/api/users/:uid/role`), no la ruta concreta. La
   * concreta metería ids en un campo cuyo único uso es agrupar, y entonces
   * agrupar por él no juntaría nada.
   */
  route: string;
  /**
   * Prefijo de red, no la dirección: /24 en IPv4, /48 en IPv6. Basta para
   * correlacionar "esta red hizo estas cuarenta cosas" sin guardar un dato
   * que identifique a una persona. La dirección completa va solo a Cloud
   * Logging, que tiene su propia retención y su propio control de acceso.
   */
  ipPrefix: string | null;
  userAgent: string | null;
}

/**
 * Datos libres, propios de cada acción.
 *
 * Deliberadamente NO es `Record<string, unknown>`: una interfaz cerrada sin
 * firma de índice no es asignable a ese tipo, así que exigirlo obligaría a los
 * call sites que ya tipan sus detalles (`minigameTemplates`, `minigameWords`,
 * `minigameInstances`) a añadir `[k: string]: unknown` a su interfaz — y eso
 * haría que un typo en una clave pasara el compilador, que es exactamente lo
 * que esas interfaces existen para impedir. El tipado fuerte vive en el call
 * site, donde se sabe qué lleva cada acción; aquí solo hace falta saber que es
 * un objeto serializable.
 */
export type AuditDetails = object;

export interface AuditActor {
  uid: string;
  email: string | null;
  /**
   * El rol con el que se actuó, congelado en el momento de actuar. El doc de
   * usuario cambia; esta fila tiene que seguir diciendo con qué autoridad se
   * hizo lo que se hizo.
   */
  role: string | null;
  /** Alcance con el que se resolvieron los permisos: `*` o el slug. */
  scope: string;
}

export interface AuditEntry {
  /**
   * Del registro cerrado de `auditActions.ts`. Un typo no compila, que es
   * justo lo que no ocurría cuando esto era `string`.
   */
  action: AuditAction;
  performedBy: string;
  targetId?: string;
  targetType?: string;
  details?: AuditDetails;
  /**
   * Opcional: el escritor lo sella si falta. Los call sites que pasan su
   * propio valor lo hacen para compartir el mismo `serverTimestamp()` con la
   * mutación que registran (ver `minigameRoulette`), y eso se conserva.
   */
  timestamp?: FieldValue;

  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  category?: AuditCategory;
  actor?: AuditActor;
  context?: AuditContext;
  /**
   * La puso la red de seguridad automática porque ningún handler reclamó la
   * petición. Significa "aquí alguien cambió algo y el código no dijo qué":
   * una fila degradada, pero visible, en lugar de silencio. Se resalta en el
   * visor precisamente para que dé vergüenza y alguien la arregle.
   */
  synthesized?: true;
}

/** Prefijo de `action` → categoría. El orden importa: gana el más largo. */
const CATEGORY_BY_PREFIX: ReadonlyArray<[string, AuditCategory]> = [
  ["security.", "security"],
  ["read.", "read"],
  ["user.", "access"],
  ["access.", "access"],
  ["event.staff.", "access"],
  ["proposal.", "content"],
  ["event.", "content"],
  ["speaker.", "content"],
  ["sponsor.", "content"],
  ["team.", "content"],
  ["location.", "content"],
  ["form.", "content"],
  ["stats.", "content"],
  ["minigame_instance.", "minigame"],
  ["minigame_template.", "minigame"],
  ["minigame_word.", "minigame"],
  ["minigame_participant.", "minigame"],
  ["credential.", "operations"],
  ["credential_email.", "operations"],
  ["certificate.", "operations"],
  ["checkin.", "operations"],
  ["settings.", "operations"],
  ["site.", "operations"],
  ["http.", "operations"],
];

/**
 * Deduce la categoría del prefijo de la acción, para que los call sites que
 * ya existían la ganen sin tocarlos. `event.staff.` va antes que `event.`
 * porque asignar staff concede permisos: es control de acceso, no contenido.
 */
export function deriveCategory(action: string): AuditCategory {
  let best: AuditCategory = "operations";
  let bestLen = -1;
  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (action.startsWith(prefix) && prefix.length > bestLen) {
      best = category;
      bestLen = prefix.length;
    }
  }
  return best;
}

/**
 * Severidad por defecto. Un cambio de acceso que salió bien sigue siendo algo
 * que alguien debería mirar —es el registro que importa cuando se revisa quién
 * ganó permisos y por qué—, así que sube a `notice` en vez de quedarse en el
 * `info` del resto del contenido.
 */
export function deriveSeverity(
  category: AuditCategory,
  outcome: AuditOutcome
): AuditSeverity {
  if (outcome === "failure") return "warning";
  if (outcome === "denied")
    return category === "security" ? "warning" : "notice";
  if (category === "security") return "warning";
  if (category === "access") return "notice";
  return "info";
}
