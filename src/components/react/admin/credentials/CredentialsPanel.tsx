import { useMemo, useState, type ReactNode } from "react";
import { isDevPreview } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { EventPicker } from "../ui/EventPicker";
import {
  CornerNodes,
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
} from "../ui/atlas";
import { useCredentials } from "./useCredentials";
import { BevyQueue } from "./BevyQueue";
import { PhotoModerationQueue } from "./PhotoModerationQueue";
import { ReminderButton } from "./ReminderButton";
import { ReconcileButton } from "./ReconcileButton";
import { EmailTransportSetting } from "./EmailTransportSetting";
import {
  buildCredentialBevyCsv,
  credentialCsvFilename,
} from "./buildCredentialCsv";
import { findDniConflicts } from "./types";

/** Firestore paths are built from this; a slug with a "/" would silently
 *  address the wrong collection depth. Mirrors ../checkin/CheckinPanel.tsx. */
const SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("slug");
  return raw && SLUG_RE.test(raw) ? raw : null;
}

type Tab = "bevy" | "photos" | "all";

const EMPTY_MESSAGE: Record<Exclude<Tab, "photos">, string> = {
  bevy: "No queda nadie por cargar en Bevy. Las inscripciones nuevas aparecen aquí en cuanto llegan.",
  all: "Todavía no hay inscripciones para este evento. Aparecen aquí en cuanto alguien llena el formulario de credencial.",
};

export function CredentialsPanel({ initialSlug }: { initialSlug?: string }) {
  const { can } = useAuth();
  // Taking a photo down is admin-only and irreversible. Hiding the tab is
  // cosmetic — the API is the real gate — but showing a queue whose every
  // button 403s is worse than not showing it.
  const canModerate = can("credentials:moderate");

  const [slug] = useState<string | null>(initialSlug ?? slugFromUrl());
  const [tab, setTab] = useState<Tab>("bevy");
  const [error, setError] = useState<string | null>(null);

  const {
    credentials,
    loading,
    error: loadError,
  } = useCredentials(isDevPreview ? null : slug);

  const conflicts = useMemo(() => findDniConflicts(credentials), [credentials]);

  const stats = useMemo(
    () => ({
      total: credentials.length,
      pending: credentials.filter((c) => c.bevyStatus === "pending").length,
      loaded: credentials.filter((c) => c.bevyStatus === "loaded").length,
      photos: credentials.filter((c) => c.photoStatus === "pending_review")
        .length,
      emailFailed: credentials.filter((c) => c.emailStatus === "failed").length,
      conflicts: conflicts.size,
    }),
    [credentials, conflicts]
  );

  const visible = useMemo(() => {
    if (tab === "bevy") {
      return credentials.filter((c) => c.bevyStatus === "pending");
    }
    return credentials;
  }, [credentials, tab]);

  const downloadCsv = () => {
    if (!slug) return;
    const { csv } = buildCredentialBevyCsv(credentials);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = credentialCsvFilename(slug, new Date());
    link.click();
    // Deferred: Firefox and Safari read the blob after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (!slug) {
    return <EventPicker basePath="/admin/credentials" title="Credenciales" />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <LoadingState label="Cargando credenciales…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState
          message={`${loadError.replace(/\.$/, "")}. Si persiste, revisa que tu rol pueda ver las credenciales de este evento.`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "bevy", label: "Por cargar", count: stats.pending },
    ...(canModerate
      ? [{ id: "photos" as const, label: "Fotos", count: stats.photos }]
      : []),
    { id: "all", label: "Todos", count: stats.total },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <HeaderActions>
        <button
          type="button"
          onClick={downloadCsv}
          className={buttonClass.primary}
        >
          Descargar CSV para Bevy
        </button>
      </HeaderActions>

      {isDevPreview && (
        <p className="border-atlas-line text-atlas-mist rounded-md border px-4 py-3 text-sm leading-relaxed">
          <span className="text-atlas-glow font-semibold">
            Esta sección no funciona con datos de ejemplo.
          </span>{" "}
          Las credenciales se leen de Firestore en vivo, así que aquí las colas
          salen vacías. Para probarla, levanta los emuladores y arranca con{" "}
          <code className="text-atlas-dust break-all">
            PUBLIC_USE_FIREBASE_EMULATOR=true
          </code>
          .
        </p>
      )}

      <div className="space-y-4">
        {/* "Pendientes de cargar" is the headline metric on purpose. If people
            fill our form and nobody transcribes them into Bevy, GDG ICA ends
            up with a list of people who BELIEVE they are registered and are
            not — which is worse than having no form at all. */}
        <div className="@container relative">
          <CornerNodes />
          <dl className="border-atlas-line bg-atlas-line grid grid-cols-2 gap-px overflow-hidden rounded-xs border @2xl:grid-cols-5">
            <Stat label="Por cargar en Bevy" value={stats.pending} lead />
            <Stat label="Cargados" value={stats.loaded} />
            <Stat label="Inscripciones" value={stats.total} />
            <Stat label="Fotos por revisar" value={stats.photos} />
            <Stat
              label="DNI repetidos"
              value={stats.conflicts}
              tone="text-atlas-glow"
            />
          </dl>
        </div>

        {stats.emailFailed > 0 && (
          <p className="border-atlas-rose/40 bg-atlas-rose/5 text-atlas-dust rounded-md border px-4 py-3 text-sm">
            {stats.emailFailed === 1
              ? "1 correo de credencial no salió tras agotar los reintentos."
              : `${stats.emailFailed} correos de credencial no salieron tras agotar los reintentos.`}{" "}
            <span className="text-atlas-mist">
              Están en «Todos» con la marca «Correo: falló».
            </span>
          </p>
        )}

        {error && <ErrorState message={error} />}
      </div>

      <div className="flex flex-wrap gap-10">
        <section
          aria-labelledby="credenciales-cruce"
          className="min-w-[min(100%,28rem)] flex-[1.6]"
        >
          <SectionHeading>
            <span id="credenciales-cruce">Cruce con Bevy</span>
          </SectionHeading>
          <div className="divide-atlas-line border-atlas-line divide-y border-b">
            <ReconcileButton slug={slug} onError={setError} />
            <ReminderButton
              slug={slug}
              credentials={credentials}
              onError={setError}
            />
          </div>
        </section>
        <EmailTransportSetting onError={setError} />
      </div>

      <section aria-labelledby="credenciales-lista" className="@container">
        <SectionHeading>
          <span id="credenciales-lista">Inscripciones</span>
        </SectionHeading>

        <div
          role="group"
          aria-label="Qué inscripciones ver"
          className="border-atlas-line mb-2 inline-flex flex-wrap rounded-md border p-1"
        >
          {tabs.map((t) => (
            <TabButton
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}{" "}
              <span
                className={`tabular-nums ${
                  tab === t.id ? "text-atlas-mist" : "text-atlas-fog"
                }`}
              >
                {t.count}
              </span>
            </TabButton>
          ))}
        </div>

        {tab === "photos" && canModerate ? (
          <PhotoModerationQueue
            slug={slug}
            credentials={credentials}
            onError={setError}
          />
        ) : (
          <BevyQueue
            slug={slug}
            credentials={visible}
            conflicts={conflicts}
            onError={setError}
            emptyMessage={EMPTY_MESSAGE[tab === "photos" ? "all" : tab]}
          />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  lead,
  tone = "text-atlas-dust",
}: {
  label: string;
  value: number;
  lead?: boolean;
  tone?: string;
}) {
  const color =
    value === 0 ? "text-atlas-fog" : lead ? "text-atlas-star" : tone;
  return (
    <div
      className={`bg-atlas-night flex flex-col-reverse justify-end gap-2 px-5 py-4 ${
        lead ? "col-span-2 @2xl:col-span-1" : ""
      }`}
    >
      <dt className="atlas-label text-atlas-mist">{label}</dt>
      <dd
        className={`leading-none font-semibold tabular-nums ${color} ${
          lead ? "text-[2rem]" : "text-[1.75rem]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-atlas-deep text-atlas-dust"
          : "text-atlas-mist hover:text-atlas-dust"
      }`}
    >
      {children}
    </button>
  );
}
