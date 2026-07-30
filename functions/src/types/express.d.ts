import type { AuditContext } from "../utils/auditTypes";

/**
 * Aumenta `express.Request` en vez de castear.
 *
 * El resto del código usa el cast `(req as AuthenticatedRequest).user`, y para
 * `user` está bien: solo lo leen handlers que corren detrás del middleware que
 * lo pone. Estos dos campos son distintos — los tiene que leer y escribir
 * middleware que no sabe nada de autenticación (el que captura el contexto, el
 * limitador de tasa, el manejador de errores), y obligar a cada uno a inventar
 * su propio cast a una interfaz distinta es cómo se acaba con cuatro
 * definiciones del mismo campo que nadie mantiene sincronizadas.
 */
declare global {
  namespace Express {
    interface Request {
      /** Lo pone `auditContext()`; puede faltar si el middleware no corrió. */
      auditContext?: AuditContext;
      /**
       * `true` en cuanto un handler escribe su propia entrada de auditoría.
       * La red de seguridad automática lo consulta para no duplicar: sin esta
       * marca, cada mutación bien auditada generaría además una fila
       * sintética, y el registro tendría el doble de filas y la mitad de
       * credibilidad.
       */
      auditClaimed?: boolean;
    }
  }
}
