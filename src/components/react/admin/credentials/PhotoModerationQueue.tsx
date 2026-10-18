import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { getStorage } from "@/lib/firebase";
import { buttonClass, inputClass } from "../ui/atlas";
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
  const reasonId = useId();
  const name = `${credential.firstName} ${credential.lastName}`.trim();

  const moderate = async (action: "approve" | "remove") => {
    setBusy(true);
    const res = await api.moderateCredentialPhoto(slug, credential.id, {
      action,
      reason: action === "remove" ? reason.trim() : "",
    });
    setBusy(false);
    if (!res.success)
      onError(
        res.error ??
          `No se pudo moderar la foto de ${name || `#${credential.sequenceNumber}`}. Inténtalo de nuevo.`
      );
  };

  return (
    <li className="border-atlas-line flex min-w-0 flex-col gap-3 rounded-xs border p-3">
      <div className="bg-atlas-deep/40 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xs">
        {url ? (
          <img
            src={url}
            alt={`Credencial de ${name}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="atlas-label text-atlas-fog">Sin imagen</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-atlas-dust truncate text-sm font-semibold">
          {name || "Sin nombre"}
        </p>
        <p className="text-atlas-fog mt-0.5 text-xs tabular-nums">
          #{credential.sequenceNumber}
          {credential.photoUploadedAt && (
            <>
              {" · "}
              <time dateTime={credential.photoUploadedAt.toISOString()}>
                {credential.photoUploadedAt.toLocaleString("es-PE", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </>
          )}
        </p>
      </div>

      <label htmlFor={reasonId} className="sr-only">
        Motivo para quitar la foto de {name || `#${credential.sequenceNumber}`}{" "}
        (opcional)
      </label>
      <input
        id={reasonId}
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo si la quitas"
        className={inputClass}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => moderate("approve")}
          className="border-atlas-line text-atlas-dust hover:border-atlas-mist hover:bg-atlas-deep flex-1 rounded-md border px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50"
        >
          Aprobar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => moderate("remove")}
          className="border-atlas-rose/40 text-atlas-rose hover:bg-atlas-rose/10 flex-1 rounded-md border px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50"
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
        onError(
          res.error ??
            "Se cortó la aprobación en lote. Las fotos que siguen en la cola no se aprobaron: vuelve a intentarlo."
        );
        break;
      }
    }
    setBulkBusy(false);
  };

  if (pending.length === 0) {
    return (
      <p className="border-atlas-line text-atlas-mist mt-4 rounded-xs border border-dashed px-5 py-8 text-sm">
        No hay fotos por revisar. Las que suban los asistentes aparecen aquí, de
        la más antigua a la más reciente.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-atlas-mist text-sm">
          <span className="text-atlas-dust tabular-nums">{pending.length}</span>{" "}
          {pending.length === 1 ? "foto por revisar" : "fotos por revisar"}, de
          la más antigua a la más reciente.
        </p>
        <button
          type="button"
          disabled={bulkBusy}
          onClick={approveAll}
          className={buttonClass.secondary}
        >
          {bulkBusy
            ? "Aprobando…"
            : pending.length === 1
              ? "Aprobar la foto"
              : `Aprobar las ${pending.length} fotos`}
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-3 @4xl:grid-cols-4">
        {pending.map((c) => (
          <PhotoCard key={c.id} slug={slug} credential={c} onError={onError} />
        ))}
      </ul>
    </div>
  );
}
