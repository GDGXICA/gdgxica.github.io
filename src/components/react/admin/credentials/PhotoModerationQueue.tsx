import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getStorage } from "@/lib/firebase";
import type { Credential } from "./types";

interface Props {
  slug: string;
  credentials: Credential[];
  onError: (message: string) => void;
}

/**
 * Resolves a Storage object path to a download URL.
 *
 * Reads are gated to organizer/admin by storage.rules, which resolves the
 * role through firestore.get() — that is what lets this render an image
 * without a signed-URL endpoint in the API.
 */
function useImageUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const storage = await getStorage();
        const { getDownloadURL, ref } = await import("firebase/storage");
        const resolved = await getDownloadURL(ref(storage, path));
        if (!cancelled) setUrl(resolved);
      } catch {
        // A missing or unreadable object renders as a placeholder rather
        // than blocking the whole grid.
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}

function PhotoCard({
  slug,
  credential,
  onError,
}: {
  slug: string;
  credential: Credential;
  onError: (message: string) => void;
}) {
  const url = useImageUrl(
    credential.credentialImagePath ?? credential.photoPath
  );
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const moderate = async (action: "approve" | "remove") => {
    setBusy(true);
    const res = await api.moderateCredentialPhoto(slug, credential.id, {
      action,
      reason: action === "remove" ? reason.trim() : "",
    });
    setBusy(false);
    if (!res.success) onError(res.error ?? "No se pudo moderar la foto");
  };

  return (
    <li className="border-gray-custom flex flex-col gap-2 rounded-lg border bg-white p-3">
      <div className="bg-section flex aspect-[4/5] items-center justify-center overflow-hidden rounded">
        {url ? (
          <img
            src={url}
            alt={`Credencial de ${credential.firstName} ${credential.lastName}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-tertiary text-xs">Sin imagen</span>
        )}
      </div>

      <p className="text-primary truncate text-sm font-semibold">
        {credential.firstName} {credential.lastName}
      </p>

      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        className="border-gray-custom rounded border px-2 py-1 text-xs"
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => moderate("approve")}
          className="bg-google-green flex-1 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
        >
          Aprobar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => moderate("remove")}
          className="bg-google-red flex-1 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
        >
          Quitar foto
        </button>
      </div>
    </li>
  );
}

/**
 * Photo review.
 *
 * Moderation here is REACTIVE take-down, not pre-publication gating: the
 * credential is composed on the attendee's device and downloaded before
 * anything is submitted, so a bad photo already exists on their phone
 * regardless. What this screen controls is what GDG ICA stores and what
 * GDG ICA re-sends, which is what the privacy policy actually promises.
 */
export function PhotoModerationQueue({ slug, credentials, onError }: Props) {
  const [bulkBusy, setBulkBusy] = useState(false);

  const pending = credentials
    .filter((c) => c.photoStatus === "pending_review")
    // Oldest first: the queue is worked front to back, and a photo that
    // has been live longest is the one most worth looking at.
    .sort(
      (a, b) =>
        (a.photoUploadedAt?.getTime() ?? 0) -
        (b.photoUploadedAt?.getTime() ?? 0)
    );

  const approveAll = async () => {
    setBulkBusy(true);
    // Serial rather than Promise.all: this shares the per-uid writeLimiter
    // (30/min) with every other admin action, and a parallel burst of 300
    // would 429 itself halfway through.
    for (const c of pending) {
      const res = await api.moderateCredentialPhoto(slug, c.id, {
        action: "approve",
        reason: "",
      });
      if (!res.success) {
        onError(res.error ?? "No se pudo aprobar todo el lote");
        break;
      }
    }
    setBulkBusy(false);
  };

  if (pending.length === 0) {
    return (
      <p className="text-secondary py-8 text-center text-sm">
        No hay fotos por revisar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-secondary text-sm">
          {pending.length} foto{pending.length === 1 ? "" : "s"} por revisar
        </p>
        <button
          type="button"
          disabled={bulkBusy}
          onClick={approveAll}
          className="border-gray-custom text-secondary rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          {bulkBusy ? "Aprobando…" : "Aprobar todas las visibles"}
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {pending.map((c) => (
          <PhotoCard key={c.id} slug={slug} credential={c} onError={onError} />
        ))}
      </ul>
    </div>
  );
}
