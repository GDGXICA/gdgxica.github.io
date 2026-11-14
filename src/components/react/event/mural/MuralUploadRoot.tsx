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

  const loadingView = phase === "init" || settingsLoading;
  const open = settings.state === "open";
  const canUpload = open && phase === "ready" && left > 0 && consent;

  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:gap-20">
      <div className="lg:sticky lg:top-28">
        <h1 className="m-0 font-(family-name:--font-display) text-[clamp(2.4rem,1.6rem+3vw,4.5rem)] leading-[0.95] font-bold tracking-[-0.02em] text-balance text-(--ink)">
          {settings.headline || headline}
        </h1>

        <p className="mt-6 max-w-[46ch] text-(--muted)">
          Tus fotos aparecen en la pantalla grande del evento.{" "}
          <strong className="font-semibold text-(--ink)">
            Una persona de la organización revisa cada foto antes de que se vea
          </strong>
          , así que puede tardar un momento. Si te arrepientes, desde aquí mismo
          puedes pedir que la quitemos.
        </p>
      </div>

      <div>
        {loadingView ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--ochre) border-t-transparent motion-reduce:animate-none" />
          </div>
        ) : blockedReason ? (
          <p className="border-l-2 border-(--ochre) bg-(--surface-1) px-5 py-4 text-(--ink)">
            {blockedReason}
          </p>
        ) : !open ? (
          <p className="rounded-(--radius) border border-dashed border-(--line-strong) px-6 py-10 text-center text-(--muted)">
            {settings.state === "paused"
              ? "Las subidas están en pausa un momento."
              : "Las subidas al mural están cerradas."}
          </p>
        ) : (
          <div className="n-panel n-marks p-5 sm:p-7">
            <label
              className="mb-2 block text-[0.9375rem] font-medium text-(--ink)"
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
              className="min-h-12 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-2) px-3.5 py-2.5 text-base text-(--ink) transition-colors placeholder:text-(--muted)/70 hover:border-(--muted) focus:border-(--ochre)"
            />

            <label className="mt-5 flex min-h-11 items-start gap-3 text-[0.9375rem] leading-6 text-(--ink)">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-(--ochre)"
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
              tabIndex={-1}
              aria-hidden="true"
              disabled={!canUpload}
              onChange={(e) =>
                upload(Array.from(e.target.files ?? []).slice(0, left))
              }
              className="sr-only"
            />

            <button
              type="button"
              disabled={!canUpload}
              onClick={() => fileInput.current?.click()}
              className="nb nb--primary mt-6 w-full"
            >
              <span className="nb__label">
                {mine.length > 0 ? "Subir más fotos" : "Elegir fotos"}
              </span>
              <span className="nb__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14" />
                </svg>
              </span>
            </button>

            {!consent && left > 0 && (
              <p className="mt-3 text-sm text-(--muted)">
                Marca la casilla de arriba para elegir tus fotos.
              </p>
            )}

            <div className="mt-5 border-t border-(--line) pt-4">
              <p className="m-0 text-[0.9375rem] text-(--muted)">
                {left > 0
                  ? `Te quedan ${left} ${left === 1 ? "foto" : "fotos"}.`
                  : "Ya subiste todas tus fotos. ¡Gracias!"}
              </p>
              {settings.maxPerUid > 0 && (
                <div
                  className="mt-2.5 h-1 overflow-hidden rounded-full bg-(--surface-3)"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-(--ochre)"
                    style={{
                      width: `${Math.min(100, Math.round((100 * (settings.maxPerUid - left)) / settings.maxPerUid))}%`,
                    }}
                  />
                </div>
              )}

              {progress && (
                <p className="n-mono mt-3 mb-0 text-(--ochre)">
                  Subiendo {progress.done + 1} de {progress.total}…
                </p>
              )}
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 border-l-2 border-(--ochre) bg-(--surface-1) px-4 py-3 text-[0.9375rem] text-(--ink)">
            {message}
          </p>
        )}

        <MyPhotosList
          mine={mine}
          busyId={busyId}
          onRequestRemoval={requestRemoval}
        />
      </div>
    </div>
  );
}
