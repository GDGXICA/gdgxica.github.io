/**
 * Opens a PDF returned by the API in a new tab.
 *
 * The tab is opened synchronously, inside the click, and only pointed at
 * the PDF once it arrives: opening it after the request would be a
 * popup that browsers block. The page's CSP has no `blob:` in frame-src,
 * which is why the preview is a tab and not an inline frame.
 */
export async function openPdf(
  load: () => Promise<{
    success: boolean;
    data?: { pdfBase64: string };
    error?: string;
  }>
): Promise<string | null> {
  const tab = window.open("", "_blank");
  const res = await load();
  if (!res.success || !res.data) {
    tab?.close();
    return res.error || "No se pudo generar la vista previa.";
  }
  const bytes = Uint8Array.from(atob(res.data.pdfBase64), (c) =>
    c.charCodeAt(0)
  );
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" })
  );
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  // Long enough for the tab to load it; the URL is not needed after.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}
