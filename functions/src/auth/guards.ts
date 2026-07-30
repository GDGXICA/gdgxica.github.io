import * as admin from "firebase-admin";
import { canAssignRole, isRole, type Permission } from "./permissions";

/**
 * Guardas compartidas por TODOS los caminos que cambian el rol de alguien.
 *
 * Vivían dentro de `handlers/users.ts`, y por eso los otros dos caminos que
 * escriben `users/{uid}.role` —aprobar una solicitud de acceso y canjear una
 * invitación, ambos en `handlers/access.ts`— no las aplicaban. El resultado era
 * que una invitación al correo de un admin, canjeada por ese mismo admin, lo
 * degradaba sin que nada lo impidiera; y si era el último, dejaba la plataforma
 * sin nadie capaz de administrarla salvo entrando a mano por la consola de
 * Firebase. Están aquí para que el siguiente camino que toque roles no pueda
 * saltárselas por descuido.
 */

/**
 * Consulta de admins. Se expone la consulta y no solo el resultado porque
 * dentro de una transacción hay que leerla con `tx.get()`, y una lectura suelta
 * no cuenta para la transacción: dos canjes simultáneos podrían pasar los dos
 * la comprobación y dejar cero admins.
 */
export function activeAdminsQuery(): admin.firestore.Query {
  return admin.firestore().collection("users").where("role", "==", "admin");
}

/** Cuenta los que de verdad pueden operar: un admin suspendido no gobierna nada. */
export function countActiveAdminsIn(
  snapshot: admin.firestore.QuerySnapshot
): number {
  return snapshot.docs.filter((d) => d.data()?.status !== "suspended").length;
}

/**
 * Cuenta los admins que realmente pueden operar. Se usa para no dejar la
 * plataforma sin nadie capaz de administrarla: un descuido ahí obliga a
 * entrar por la consola de Firebase a reparar el desastre a mano.
 */
export async function countActiveAdmins(): Promise<number> {
  return countActiveAdminsIn(await activeAdminsQuery().get());
}

/**
 * El actor debe poseer todos los permisos del rol que toca — tanto el que
 * quita como el que pone. Sin la comprobación sobre el rol ACTUAL, alguien
 * con `users:role:write` concedido a mano podría degradar a un admin pese a
 * no tener sus permisos, que es escalada por la puerta de atrás.
 */
export function actorDominates(
  actorPermissions: ReadonlySet<Permission>,
  role: unknown
): boolean {
  if (!isRole(role)) return true; // rol corrupto: no hay nada que dominar
  return canAssignRole(actorPermissions, role);
}
