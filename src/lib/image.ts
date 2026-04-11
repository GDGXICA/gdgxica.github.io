/**
 * Converts a full image URL to a relative path for display.
 * gdg-ica-data stores URLs as https://gdgxica.github.io/speakers/x.webp
 * but images are served from the current domain (gdgica.com).
 */
export function toImagePath(url: string | null | undefined): string {
  if (!url) return "/placeholder.svg";
  return url.replace("https://gdgxica.github.io", "");
}
