import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { remainingQuota, type MuralPhoto } from "@/lib/mural";
import { LOCAL_STORAGE_ALIAS_KEY } from "../types";
import { MyPhotosList } from "./MyPhotosList";
import { clientRequestIdFor, prepareMuralPhoto } from "./prepareMuralPhoto";
import { useMuralSettings } from "./useMuralSettings";
import { useMyMuralPhotos } from "./useMyMuralPhotos";

interface Props {
  slug: string;
  headline: string;
}

type Phase = "init" | "ready" | "working" | "blocked";

function readStoredAlias(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredAlias(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function MuralUploadRoot({ slug, headline }: Props) {
  const [phase, setPhase] = useState<Phase>("init");
  const [uid, setUid] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { settings, loading: settingsLoading } = useMuralSettings(slug);
  const { mine } = useMyMuralPhotos(slug, uid);

  const left = remainingQuota(mine, settings.maxPerUid);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await signInAnonymouslyIfNeeded();
        if (cancelled) return;
        setUid(user?.uid ?? null);
        setPhase("ready");
      } catch {
        if (cancelled) return;
        setMessage(
          "No pudimos prepararte la sesión. Recarga la página e inténtalo otra vez."
        );
        setPhase("blocked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const saved = readStoredAlias(LOCAL_STORAGE_ALIAS_KEY(slug));
    if (saved) setAlias(saved);
  }, [slug]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setPhase("working");
      setMessage(null);

      writeStoredAlias(LOCAL_STORAGE_ALIAS_KEY(slug), alias.trim());

      let uploaded = 0;
      let blocked = false;

      try {
        for (const [index, file] of files.entries()) {
          setProgress({ done: index, total: files.length });

          const prepared = await prepareMuralPhoto(file);
          if ("error" in prepared) {
            setMessage(prepared.error);
            continue;
          }

          const res = await api.uploadMuralPhoto(slug, {
            dataUrl: prepared.dataUrl,
            alias: alias.trim(),
            width: prepared.width ?? 0,
            height: prepared.height ?? 0,
            consent: true,
            clientRequestId: clientRequestIdFor(file),
          });

          if (res.success) {
            uploaded += 1;
            continue;
          }

          if (
            res.code === "quota_uid" ||
            res.code === "mural_full" ||
            res.code === "mural_closed"
          ) {
            setBlockedReason(res.error ?? "No se admiten más fotos por ahora.");
            setPhase("blocked");
            blocked = true;
            return;
          }

          if (res.code === "rate_ip") {
            setMessage(
              "Hay muchas subidas a la vez desde esta red. Espera unos " +
                "segundos y vuelve a intentarlo."
            );
            return;
          }

          setMessage(res.error ?? "No se pudo subir la foto.");
        }

        if (uploaded > 0) {
          setMessage(
            uploaded === 1
              ? "¡Listo! Tu foto está esperando revisión."
              : `¡Listo! ${uploaded} fotos esperando revisión.`
          );
        }
      } catch {
        setMessage(
          "No pudimos preparar la foto en este navegador. Prueba con otra o " +
            "recarga la página."
        );
      } finally {
        setProgress(null);
        if (!blocked) setPhase("ready");
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [slug, alias]
  );

  const requestRemoval = useCallback(
    async (photo: MuralPhoto) => {
      const note = window.prompt(
        "¿Quieres que quitemos esta foto?\n\n" +
          "Puedes contarnos por qué (opcional). Alguien de la organización la retirará."
      );
      if (note === null) return;

      setBusyId(photo.id);
      const res = await api.requestMuralRemoval(slug, photo.id, note.trim());
      setBusyId(null);
      setMessage(
        res.success
          ? "Pedido. La quitaremos en cuanto la veamos."
          : (res.error ?? "No se pudo enviar la petición.")
      );
    },
    [slug]
  );

  if (phase === "init" || settingsLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const open = settings.state === "open";
  const canUpload = open && phase === "ready" && left > 0 && consent;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">{settings.headline || headline}</h1>

      {blockedReason ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {blockedReason}
        </p>
      ) : !open ? (
        <p className="mt-4 rounded-lg bg-gray-100 p-4 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {settings.state === "paused"
            ? "Las subidas están en pausa un momento."
            : "Las subidas al mural están cerradas."}
        </p>
      ) : (
        <>
          <label
            className="mt-6 mb-1 block text-sm font-medium"
            htmlFor="mural-alias"
          >
            Tu nombre (opcional)
          </label>
          <input
            id="mural-alias"
            type="text"
            maxLength={24}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Cómo quieres que aparezca"
            className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Confirmo que puedo compartir esta foto y que quienes aparecen en
              ella están de acuerdo.
            </span>
          </label>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"

            multiple
            disabled={!canUpload}
            onChange={(e) =>
              upload(Array.from(e.target.files ?? []).slice(0, left))
            }
            className="mt-4 w-full text-sm disabled:opacity-50"
          />

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {left > 0
              ? `Te quedan ${left} ${left === 1 ? "foto" : "fotos"}.`
              : "Ya subiste todas tus fotos. ¡Gracias!"}
          </p>

          {progress && (
            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              Subiendo {progress.done + 1} de {progress.total}…
            </p>
          )}
        </>
      )}

      {message && (
        <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          {message}
        </p>
      )}

      <MyPhotosList
        mine={mine}
        busyId={busyId}
        onRequestRemoval={requestRemoval}
      />
    </div>
  );
}
