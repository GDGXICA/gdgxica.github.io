import { useEffect, useState } from "react";
import type { CreditLinkEntry } from "@/data/gcpCredits";
import { QrLightbox } from "./QrLightbox";

interface Props {
  primary: CreditLinkEntry;
  backup: CreditLinkEntry;
}

function ExternalIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CreditPassCard({
  entry,
  variant,
  copiedCode,
  onCopy,
  onExpandQr,
}: {
  entry: CreditLinkEntry;
  variant: "primary" | "backup";
  copiedCode: string | null;
  onCopy: (entry: CreditLinkEntry) => void;
  onExpandQr: (entry: CreditLinkEntry) => void;
}) {
  const isCopied = copiedCode === entry.code;
  const displayUrl = entry.url.replace(/^https?:\/\//, "");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center lg:gap-10">
      <div className="space-y-6">
        <div className="space-y-2">
          <h3
            className="text-2xl font-semibold tracking-tight text-(--ink) sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {entry.label}
          </h3>
          <p className="n-mono break-all text-(--ochre)">{displayUrl}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-(--line) py-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-(--muted)">Código</dt>
            <dd className="n-mono mt-1 text-(--ink)">{entry.code}</dd>
          </div>
          <div>
            <dt className="text-sm text-(--muted)">Disponibles</dt>
            <dd className="n-mono mt-1 text-(--ink)">
              {entry.creditsCount} créditos
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-sm text-(--muted)">Horario válido</dt>
            <dd className="n-mono mt-1 text-(--ink)">08:00 – 20:00 PET</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`nb ${variant === "backup" ? "nb--ghost" : ""}`}
          >
            <span className="nb__label">
              {variant === "primary"
                ? "Canjear créditos ahora"
                : "Abrir enlace de respaldo"}
            </span>
            <span className="nb__icon nb__icon--external" aria-hidden="true">
              <ExternalIcon />
            </span>
          </a>

          <button
            type="button"
            onClick={() => onCopy(entry)}
            className="nb nb--ghost"
          >
            <span className="nb__label">
              {isCopied ? "Enlace copiado" : "Copiar enlace"}
            </span>
            <span className="nb__icon" aria-hidden="true">
              {isCopied ? <CheckIcon /> : <CopyIcon />}
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-lg bg-(--surface-2) p-5">
        <button
          type="button"
          onClick={() => onExpandQr(entry)}
          className="group w-full max-w-[260px] cursor-pointer rounded-md bg-white p-3 transition-transform duration-150 hover:scale-[1.015] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--ochre)"
          aria-label={`Ampliar código QR de ${entry.code}`}
        >
          <img
            src={entry.qrImage}
            alt={entry.qrAlt}
            width={600}
            height={600}
            className="aspect-square h-auto w-full object-contain"
          />
        </button>

        <button
          type="button"
          onClick={() => onExpandQr(entry)}
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-(--ink) transition-colors hover:bg-(--surface-3) hover:text-(--ochre)"
        >
          <ExpandIcon />
          <span>Ampliar QR para escanear</span>
        </button>
      </div>
    </div>
  );
}

export function GcpCreditsVault({ primary, backup }: Props) {
  const [backupOpen, setBackupOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [lightboxEntry, setLightboxEntry] = useState<CreditLinkEntry | null>(
    null
  );

  useEffect(() => {
    if (!copiedCode) return;
    const timer = window.setTimeout(() => setCopiedCode(null), 2400);
    return () => window.clearTimeout(timer);
  }, [copiedCode]);

  const handleCopy = async (entry: CreditLinkEntry) => {
    try {
      await navigator.clipboard.writeText(entry.url);
      setCopiedCode(entry.code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = entry.url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedCode(entry.code);
    }
  };

  return (
    <section aria-labelledby="credits-vault-title" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="credits-vault-title" className="n-head">
          Enlaces de canje
        </h2>
        <p className="text-sm text-(--muted)">
          Usa primero el enlace principal; escanea el QR o ábrelo directo desde
          tu celular.
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {copiedCode ? `Enlace ${copiedCode} copiado al portapapeles.` : ""}
      </p>

      <article className="n-panel n-marks p-6 sm:p-8">
        <CreditPassCard
          entry={primary}
          variant="primary"
          copiedCode={copiedCode}
          onCopy={handleCopy}
          onExpandQr={setLightboxEntry}
        />
      </article>

      <div className="n-panel overflow-hidden">
        <button
          type="button"
          id="backup-toggle"
          aria-expanded={backupOpen}
          aria-controls="backup-credit-panel"
          onClick={() => setBackupOpen((prev) => !prev)}
          className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-(--surface-2)"
        >
          <div>
            <span className="block font-semibold text-(--ink)">
              ¿Tuviste problemas al activar o ya canjeaste el enlace principal?
            </span>
            <span className="mt-0.5 block text-sm text-(--muted)">
              Mostrar enlace de respaldo (
              <span className="n-mono">{backup.code}</span>)
            </span>
          </div>
          <span className="shrink-0 text-(--ochre)">
            <ChevronIcon open={backupOpen} />
          </span>
        </button>

        {backupOpen && (
          <div
            id="backup-credit-panel"
            role="region"
            aria-labelledby="backup-toggle"
            className="border-t border-(--line) p-6 sm:p-8"
          >
            <p className="mb-6 max-w-2xl text-sm text-(--muted)">
              Este cupón de respaldo existe para asistentes que presenten un
              error al activar su cuenta o que ya hayan canjeado el enlace
              principal. Si aún no intentaste con{" "}
              <span className="n-mono text-(--ink)">{primary.code}</span>,
              pruébalo primero.
            </p>
            <CreditPassCard
              entry={backup}
              variant="backup"
              copiedCode={copiedCode}
              onCopy={handleCopy}
              onExpandQr={setLightboxEntry}
            />
          </div>
        )}
      </div>

      <QrLightbox
        open={lightboxEntry !== null}
        qrDataUrl={lightboxEntry?.qrImage ?? ""}
        url={lightboxEntry?.url ?? ""}
        caption={
          lightboxEntry ? `${lightboxEntry.label} · ${lightboxEntry.code}` : ""
        }
        subtitle={
          lightboxEntry
            ? `${lightboxEntry.periodLabel} · Solo cuentas @gmail.com`
            : undefined
        }
        alt={lightboxEntry?.qrAlt ?? ""}
        onClose={() => setLightboxEntry(null)}
      />
    </section>
  );
}
