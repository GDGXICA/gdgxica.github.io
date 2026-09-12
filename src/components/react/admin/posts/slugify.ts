/**
 * Título → slug, que en un post es también su id y su URL.
 *
 * El id tiene que pasar el `safeId` del servidor
 * (`/^[a-zA-Z0-9_-]{1,100}$/`), así que esto no es cosmética: un título con
 * tildes, signos o emoji —lo normal en castellano— daría un 400 si se
 * copiara tal cual.
 */
export function slugify(title: string): string {
  return (
    title
      .normalize("NFD")
      // Marcas diacríticas: "canción" → "cancion". La ñ se descompone en
      // n + tilde, así que sobrevive como "n", que es lo que se quiere en una
      // URL.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100)
      // El recorte puede dejar un guion colgando al final.
      .replace(/-+$/g, "")
  );
}

/**
 * Igual que `slugify`, pero conserva el separador final mientras se escribe.
 *
 * Existe porque el campo se sanea en cada pulsación, y `slugify` recorta los
 * guiones de los extremos: al teclear "mi-slug", el guion desaparecía en
 * cuanto se escribía y salía "mislug". Era imposible escribir un guion.
 * `onBlur` vuelve a pasar por `slugify` para que no quede colgando.
 */
export function slugifyWhileTyping(value: string): string {
  const base = slugify(value);
  const endsWithSeparator = /[\s-]$/.test(value);
  return base && endsWithSeparator ? `${base}-` : base;
}
