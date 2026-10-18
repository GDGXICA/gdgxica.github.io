const KNOWN_ERRORS: Record<string, string> = {
  "Invalid map_url":
    "El enlace de Google Maps no es una dirección web válida. Cópialo con el botón «Compartir» de Maps.",
  "Invalid map_embed URL":
    "El enlace para incrustar debe empezar por https://www.google.com/maps/. Cópialo en Maps desde «Compartir», pestaña «Insertar un mapa», solo el valor de src.",
  "Location not found":
    "Esa ubicación ya no existe; quizá alguien la eliminó. Vuelve a la lista para ver las actuales.",
};

export function describeLocationError(
  error: string | undefined,
  fallback: string
): string {
  return (error && KNOWN_ERRORS[error]) || fallback;
}
