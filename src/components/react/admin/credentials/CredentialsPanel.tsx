import { useMemo, useState } from "react";
import { isDevPreview } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { EventPicker } from "../ui/EventPicker";
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
      <p className="text-secondary py-12 text-center text-sm">
        Cargando credenciales…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        {loadError}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-primary text-2xl font-bold">
          Credenciales · {slug}
        </h1>
        <div className="flex flex-wrap items-start gap-2">
          <ReconcileButton slug={slug} onError={setError} />
          <ReminderButton
            slug={slug}
            credentials={credentials}
            onError={setError}
          />
          <button
            type="button"
            onClick={downloadCsv}
            className="bg-google-blue rounded px-3 py-2 text-sm text-white"
          >
            Descargar CSV para Bevy
          </button>
        </div>
      </header>

      {/* "Pendientes de cargar" is the headline metric on purpose. If people
          fill our form and nobody transcribes them into Bevy, GDG ICA ends
          up with a list of people who BELIEVE they are registered and are
          not — which is worse than having no form at all. */}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Pendientes de cargar" value={stats.pending} highlight />
        <Stat label="Cargados" value={stats.loaded} />
        <Stat label="Total" value={stats.total} />
        <Stat label="Fotos por revisar" value={stats.photos} />
        <Stat label="DNI duplicados" value={stats.conflicts} />
      </dl>

      {stats.emailFailed > 0 && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {stats.emailFailed} correo(s) marcados como fallidos tras agotar los
          reintentos.
        </p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <EmailTransportSetting onError={setError} />

      <nav className="border-gray-custom flex gap-1 border-b">
        <TabButton active={tab === "bevy"} onClick={() => setTab("bevy")}>
          Cola Bevy ({stats.pending})
        </TabButton>
        {canModerate && (
          <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
            Fotos ({stats.photos})
          </TabButton>
        )}
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          Todos ({stats.total})
        </TabButton>
      </nav>

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
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-google-blue bg-[#EFF6FF]"
          : "border-gray-custom bg-white"
      }`}
    >
      <dt className="text-tertiary text-xs">{label}</dt>
      <dd className="text-primary text-2xl font-bold">{value}</dd>
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium ${
        active
          ? "border-google-blue text-google-blue border-b-2"
          : "text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
