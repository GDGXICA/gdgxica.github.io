/**
 * Colapsa el valor de una cabecera a una sola línea acotada y sin caracteres
 * de control.
 *
 * Vivía dentro de `handlers/credentials.ts`, que lo aplica al user-agent que
 * guarda como prueba de consentimiento. Al empezar a guardar el user-agent
 * también en el registro de auditoría hacía falta en dos sitios, y una segunda
 * copia de un saneador es como se acaba con dos que divergen: el día que a uno
 * le añaden un caracter a filtrar, el otro sigue dejándolo pasar.
 *
 * Lo que evita: el valor es controlado por quien llama y acaba renderizado en
 * el panel. Sin colapsar CRLF, una cabecera con saltos de línea puede fingir
 * varias entradas dentro de una, que es inyección de log — el registro deja de
 * ser fiable justo cuando hace falta leerlo.
 */
export function singleLineHeader(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
