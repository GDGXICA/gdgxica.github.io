import { useEffect, useState } from "react";
import type { ManualPhase, ManualStep } from "@/data/gcpCredits";

interface Props {
  phases: ManualPhase[];
  steps: ManualStep[];
  initialStepNumber?: number;
}

function CloseIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ArrowLeftIcon() {
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
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function ArrowRightIcon() {
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function ZoomIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  );
}

export function GcpCreditsManual({
  phases,
  steps,
  initialStepNumber = 1,
}: Props) {
  const initialIndex = Math.max(
    0,
    steps.findIndex((s) => s.number === initialStepNumber)
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<"guided" | "all">("guided");
  const [zoomStep, setZoomStep] = useState<ManualStep | null>(null);

  const currentStep = steps[activeIndex] ?? steps[0];
  const currentPhase =
    phases.find((p) => p.id === currentStep.phaseId) ?? phases[0];
  const phaseSteps = steps.filter((s) => s.phaseId === currentPhase.id);

  useEffect(() => {
    if (!zoomStep) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setZoomStep(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomStep]);

  const selectPhase = (phaseId: ManualPhase["id"]) => {
    const firstIdx = steps.findIndex((s) => s.phaseId === phaseId);
    if (firstIdx >= 0) setActiveIndex(firstIdx);
  };

  const goPrev = () => setActiveIndex((idx) => Math.max(0, idx - 1));
  const goNext = () =>
    setActiveIndex((idx) => Math.min(steps.length - 1, idx + 1));

  return (
    <section
      id="manual"
      aria-labelledby="credits-manual-title"
      className="space-y-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h2 id="credits-manual-title" className="n-head">
            Cómo activar tus créditos
          </h2>
          <p className="max-w-2xl text-(--muted)">
            Guía paso a paso en tres fases, desde el inicio de sesión hasta la
            verificación de tu cuenta de facturación en Google Cloud Console.
          </p>
        </div>

        <div
          role="group"
          aria-label="Modo de visualización del manual"
          className="inline-flex rounded-md border border-(--line-strong) bg-(--surface-1) p-1"
        >
          <button
            type="button"
            aria-pressed={viewMode === "guided"}
            onClick={() => setViewMode("guided")}
            className={`min-h-10 cursor-pointer rounded px-3.5 text-sm font-medium transition-colors ${
              viewMode === "guided"
                ? "bg-(--ochre) text-(--ochre-ink)"
                : "text-(--muted) hover:text-(--ink)"
            }`}
          >
            Paso a paso
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "all"}
            onClick={() => setViewMode("all")}
            className={`min-h-10 cursor-pointer rounded px-3.5 text-sm font-medium transition-colors ${
              viewMode === "all"
                ? "bg-(--ochre) text-(--ochre-ink)"
                : "text-(--muted) hover:text-(--ink)"
            }`}
          >
            Los {steps.length} pasos
          </button>
        </div>
      </div>

      {viewMode === "guided" ? (
        <div className="space-y-6">
          <div
            role="tablist"
            aria-label="Fases de activación"
            className="grid grid-cols-3 gap-2 border-b border-(--line) pb-3 sm:gap-4"
          >
            {phases.map((phase, idx) => {
              const isSelected = phase.id === currentPhase.id;
              const phaseRange = steps.filter((s) => s.phaseId === phase.id);
              const firstNum = phaseRange[0]?.number ?? 1;
              const lastNum =
                phaseRange[phaseRange.length - 1]?.number ?? firstNum;

              return (
                <button
                  key={phase.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => selectPhase(phase.id)}
                  className={`relative flex min-h-14 cursor-pointer flex-col justify-center rounded-md px-3 py-2.5 text-left transition-colors sm:px-4 ${
                    isSelected
                      ? "bg-(--surface-2) text-(--ink)"
                      : "bg-(--surface-1) text-(--muted) hover:bg-(--surface-2) hover:text-(--ink)"
                  }`}
                >
                  <span className="n-mono text-xs text-(--muted)">
                    Fase {idx + 1} · Pasos {firstNum}–{lastNum}
                  </span>
                  <span className="mt-0.5 text-sm font-semibold sm:text-base">
                    <span className="sm:hidden">{phase.shortLabel}</span>
                    <span className="hidden sm:inline">{phase.label}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute right-0 bottom-0 left-0 h-[3px] rounded-b-md transition-opacity"
                    style={{
                      backgroundColor: phase.accentColor,
                      opacity: isSelected ? 1 : 0,
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-8">
            <div className="space-y-4">
              <p className="text-sm text-(--muted)">{currentPhase.summary}</p>

              <ol className="space-y-2.5">
                {phaseSteps.map((step) => {
                  const isCurrent = step.number === currentStep.number;
                  return (
                    <li
                      key={step.id}
                      className={`rounded-lg border transition-colors ${
                        isCurrent
                          ? "border-(--ochre) bg-(--surface-2)"
                          : "border-(--line) bg-(--surface-1) hover:border-(--line-strong) hover:bg-(--surface-2)"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex(
                            steps.findIndex((s) => s.number === step.number)
                          )
                        }
                        aria-current={isCurrent ? "step" : undefined}
                        aria-expanded={isCurrent}
                        className="flex w-full cursor-pointer items-baseline gap-3 px-4 py-3.5 text-left"
                      >
                        <span
                          className={`n-mono shrink-0 text-sm font-semibold ${
                            isCurrent ? "text-(--ochre)" : "text-(--muted)"
                          }`}
                        >
                          {step.number}/{steps.length}
                        </span>
                        <span className="font-semibold text-(--ink)">
                          {step.title}
                        </span>
                      </button>

                      {isCurrent && (
                        <div className="space-y-2.5 px-4 pb-4 sm:pl-13">
                          <p className="text-sm leading-relaxed text-(--ink)">
                            {step.summary}
                          </p>
                          <p className="rounded bg-(--surface-3) px-3 py-2 text-sm font-medium text-(--ochre)">
                            {step.actionHint}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={activeIndex === 0}
                  className="nb nb--ghost nb--sm"
                >
                  <span className="nb__label inline-flex items-center gap-2">
                    <ArrowLeftIcon />
                    <span>Anterior</span>
                  </span>
                </button>

                <span className="n-mono text-sm text-(--muted)">
                  Paso {currentStep.number} de {steps.length}
                </span>

                <button
                  type="button"
                  onClick={goNext}
                  disabled={activeIndex === steps.length - 1}
                  className="nb nb--sm"
                >
                  <span className="nb__label inline-flex items-center gap-2">
                    <span>Siguiente</span>
                    <ArrowRightIcon />
                  </span>
                </button>
              </div>
            </div>

            <div className="lg:sticky lg:top-24">
              <div className="n-panel p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="n-mono text-sm text-(--ochre)">
                    Captura · Paso {currentStep.number}
                  </p>
                  <button
                    type="button"
                    onClick={() => setZoomStep(currentStep)}
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-(--ink) transition-colors hover:bg-(--surface-2) hover:text-(--ochre)"
                  >
                    <ZoomIcon />
                    <span>Ampliar</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setZoomStep(currentStep)}
                  className="mx-auto block w-full max-w-[300px] cursor-zoom-in overflow-hidden rounded-xl border border-(--line-strong) bg-black focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--ochre)"
                  aria-label={`Ampliar captura del paso ${currentStep.number}: ${currentStep.title}`}
                >
                  <img
                    src={currentStep.image}
                    alt={currentStep.imageAlt}
                    width={currentStep.imageWidth}
                    height={currentStep.imageHeight}
                    decoding="async"
                    className="mx-auto h-auto max-h-[540px] w-full object-contain"
                  />
                </button>

                <p className="mt-4 text-center text-sm text-(--muted)">
                  {currentStep.title}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {phases.map((phase, phaseIdx) => {
            const items = steps.filter((s) => s.phaseId === phase.id);
            return (
              <div key={phase.id} className="space-y-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--line) pb-3">
                  <h3
                    className="text-xl font-semibold text-(--ink) sm:text-2xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Fase {phaseIdx + 1}: {phase.label}
                  </h3>
                  <p className="text-sm text-(--muted)">{phase.summary}</p>
                </div>

                <ol className="grid gap-5 md:grid-cols-2">
                  {items.map((step) => (
                    <li
                      key={step.id}
                      className="n-panel grid grid-cols-[minmax(0,1fr)_120px] items-start gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_148px] sm:p-5"
                    >
                      <div className="space-y-2">
                        <p className="n-mono text-xs text-(--ochre)">
                          Paso {step.number} de {steps.length}
                        </p>
                        <h4 className="text-base font-semibold text-(--ink)">
                          {step.title}
                        </h4>
                        <p className="text-sm leading-relaxed text-(--muted)">
                          {step.summary}
                        </p>
                        <p className="text-sm font-medium text-(--ink)">
                          {step.actionHint}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setZoomStep(step)}
                        className="cursor-zoom-in overflow-hidden rounded-lg border border-(--line-strong) bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ochre)"
                        aria-label={`Ampliar captura del paso ${step.number}`}
                      >
                        <img
                          src={step.image}
                          alt={step.imageAlt}
                          width={step.imageWidth}
                          height={step.imageHeight}
                          loading="lazy"
                          decoding="async"
                          className="h-auto w-full object-contain"
                        />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-sm text-(--muted)">
        Nota sobre las capturas: provienen de la guía oficial de Google y
        muestran pantallas en portugués o inglés; los botones equivalentes
        aparecerán en el idioma configurado en tu cuenta de Google.
      </p>

      {zoomStep && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 sm:p-8"
          onClick={() => setZoomStep(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Captura ampliada del paso ${zoomStep.number}`}
        >
          <button
            type="button"
            onClick={() => setZoomStep(null)}
            className="absolute top-4 right-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-white/25 bg-(--surface-1) px-4 text-sm font-medium text-(--ink) hover:border-(--ochre) sm:top-6 sm:right-8"
            aria-label="Cerrar captura ampliada"
          >
            <CloseIcon />
            <span>Cerrar</span>
          </button>

          <div
            className="flex max-h-full max-w-lg flex-col items-center gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-center">
              <p className="n-mono text-sm text-(--ochre)">
                Paso {zoomStep.number} de {steps.length}
              </p>
              <p className="mt-1 text-lg font-semibold text-(--ink)">
                {zoomStep.title}
              </p>
            </div>
            <img
              src={zoomStep.image}
              alt={zoomStep.imageAlt}
              width={zoomStep.imageWidth}
              height={zoomStep.imageHeight}
              className="max-h-[74vh] w-auto rounded-xl border border-(--line-strong) bg-black object-contain"
            />
            <p className="max-w-md text-center text-sm text-(--muted)">
              {zoomStep.actionHint}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
