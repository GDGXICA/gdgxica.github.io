import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { remainingQuota, type MuralPhoto } from "@/lib/mural";
import { CloseIcon, UploadIcon } from "../icons";
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
    previewUrl: string | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<MuralPhoto | null>(null);
  const [removalNote, setRemovalNote] = useState("");
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

  useEffect(() => {
    if (!removalTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyId) {
        setRemovalTarget(null);
        setRemovalNote("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removalTarget, busyId]);

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
          setProgress({ done: index, total: files.length, previewUrl: null });

          const prepared = await prepareMuralPhoto(file);
          if ("error" in prepared) {
            setMessage(prepared.error);
            continue;
          }

          setProgress({
            done: index,
            total: files.length,
            previewUrl: prepared.dataUrl,
          });

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

  const openRemovalModal = useCallback((photo: MuralPhoto) => {
    setRemovalTarget(photo);
    setRemovalNote("");
  }, []);

  const confirmRemoval = useCallback(async () => {
    if (!removalTarget) return;
    const target = removalTarget;
    setBusyId(target.id);
    const res = await api.requestMuralRemoval(
      slug,
      target.id,
      removalNote.trim()
    );
    setBusyId(null);
    setRemovalTarget(null);
    setRemovalNote("");
    setMessage(
      res.success
        ? "Pedido. La quitaremos en cuanto la veamos."
        : (res.error ?? "No se pudo enviar la petición.")
    );
  }, [slug, removalTarget, removalNote]);

  const loadingView = phase === "init" || settingsLoading;
  const open = settings.state === "open";
  const canUpload = open && phase === "ready" && left > 0 && consent;

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!canUpload) return;
    const dropped = Array.from(e.dataTransfer.files ?? [])
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, left);
    if (dropped.length > 0) void upload(dropped);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:gap-20">
      <div className="lg:sticky lg:top-28">
        <p className="n-mono m-0 text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase">
          Mural en vivo
        </p>
        <h1 className="mt-2 mb-0 font-(family-name:--font-display) text-[clamp(2.25rem,1.5rem+3vw,4.25rem)] leading-[0.96] font-bold tracking-[-0.02em] text-balance text-(--ink)">
          {settings.headline || headline}
        </h1>

        <p className="mt-4 max-w-[46ch] text-[0.9375rem] text-(--muted) sm:mt-6 sm:text-base">
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
          <p className="rounded-r-xl border-l-2 border-(--ochre) bg-(--surface-1) px-5 py-4 text-(--ink)">
            {blockedReason}
          </p>
        ) : !open ? (
          <p className="rounded-2xl border border-dashed border-(--line-strong) px-6 py-10 text-center text-(--muted)">
            {settings.state === "paused"
              ? "Las subidas están en pausa un momento."
              : "Las subidas al mural están cerradas."}
          </p>
        ) : (
          <div
            className={`n-panel n-marks p-5 transition-colors sm:p-7 ${
              dragging ? "border-(--ochre) bg-(--surface-2)" : ""
            }`}
            onDragOver={(e) => {
              if (!canUpload) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
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
              className="min-h-12 w-full rounded-xl border border-(--line-strong) bg-(--surface-2) px-3.5 py-2.5 text-base text-(--ink) transition-colors placeholder:text-(--muted)/70 hover:border-(--muted) focus:border-(--ochre)"
            />

            <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-[0.9375rem] leading-6 text-(--ink)">
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
                <UploadIcon size={18} />
              </span>
            </button>

            {canUpload && (
              <p className="mt-2.5 hidden text-center text-xs text-(--muted) sm:block">
                También puedes arrastrar y soltar imágenes aquí.
              </p>
            )}

            {!consent && left > 0 && (
              <p className="mt-3 text-sm text-(--muted)">
                Marca la casilla de arriba para elegir tus fotos.
              </p>
            )}

            {/* Live Upload Progress + Preview */}
            {progress && (
              <div className="mt-5 flex items-center gap-3.5 rounded-xl border border-(--ochre)/40 bg-(--surface-2) p-3">
                {progress.previewUrl ? (
                  <img
                    src={progress.previewUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-(--surface-3)">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--ochre) border-t-transparent motion-reduce:animate-none" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="n-mono m-0 text-sm font-semibold text-(--ochre)">
                    Subiendo {progress.done + 1} de {progress.total}…
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--surface-3)">
                    <span
                      className="block h-full rounded-full bg-(--ochre) transition-[width] duration-300"
                      style={{
                        width: `${Math.round(((progress.done + 0.5) / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-(--line) pt-4">
              <p className="m-0 text-[0.9375rem] text-(--muted)">
                {left > 0
                  ? `Te quedan ${left} ${left === 1 ? "foto" : "fotos"}.`
                  : "Ya subiste todas tus fotos. ¡Gracias!"}
              </p>
              {settings.maxPerUid > 0 && (
                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-(--surface-3)"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-(--ochre) transition-[width] duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((100 * (settings.maxPerUid - left)) / settings.maxPerUid))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {message && (
          <p
            role="status"
            className="mt-4 rounded-r-xl border-l-2 border-(--ochre) bg-(--surface-1) px-4 py-3 text-[0.9375rem] text-(--ink)"
          >
            {message}
          </p>
        )}

        <MyPhotosList
          mine={mine}
          busyId={busyId}
          onRequestRemoval={openRemovalModal}
        />
      </div>

      {/* Accessible Removal Request Modal (replaces window.prompt) */}
      {removalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="removal-modal-title"
        >
          <button
            type="button"
            aria-label="Cerrar modal"
            className="fixed inset-0 cursor-default bg-(--night)/85 backdrop-blur-xs"
            onClick={() => {
              if (!busyId) {
                setRemovalTarget(null);
                setRemovalNote("");
              }
            }}
          />
          <div className="n-panel n-marks animate-stage-pop-in relative z-10 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="removal-modal-title"
                className="m-0 font-(family-name:--font-display) text-2xl font-bold text-(--ink)"
              >
                ¿Retirar esta foto?
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={Boolean(busyId)}
                onClick={() => {
                  setRemovalTarget(null);
                  setRemovalNote("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-(--muted) hover:bg-(--surface-2) hover:text-(--ink)"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-(--muted)">
              Alguien de la organización la quitará del mural en cuanto vea tu
              solicitud.
            </p>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-(--ink)">
                Motivo (opcional)
              </span>
              <textarea
                rows={3}
                maxLength={240}
                value={removalNote}
                onChange={(e) => setRemovalNote(e.target.value)}
                placeholder="Ej. Prefiero que no salga en pantalla…"
                className="w-full rounded-xl border border-(--line-strong) bg-(--surface-2) px-3.5 py-2.5 text-base text-(--ink) placeholder:text-(--muted)/70 focus:border-(--ochre)"
              />
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => {
                  setRemovalTarget(null);
                  setRemovalNote("");
                }}
                className="nb nb--ghost"
              >
                <span className="nb__label">Cancelar</span>
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void confirmRemoval()}
                className="nb nb--primary"
              >
                <span className="nb__label">
                  {busyId ? "Enviando…" : "Solicitar retirada"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
