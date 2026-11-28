import { useEffect, useMemo, useState } from "react";
import type { EventGcpCreditsConfig } from "@/data/gcpCredits";
import {
  formatPeruTime,
  getCreditWindowState,
  resolvePreviewTimeMs,
  splitCountdown,
} from "@/lib/gcpCreditsWindow";
import { getServerNowMs, syncServerClock } from "@/lib/serverClock";
import { GcpCreditsVault } from "./GcpCreditsVault";
import { GcpCreditsManual } from "./GcpCreditsManual";

interface Props {
  config: EventGcpCreditsConfig;
  initialNowMs?: number;
}

function CountdownReadout({
  hours,
  minutes,
  seconds,
  label,
}: {
  hours: string;
  minutes: string;
  seconds: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-(--muted)">{label}</p>
      <div
        className="inline-flex items-baseline gap-2 sm:gap-3"
        aria-label={`${hours} horas, ${minutes} minutos y ${seconds} segundos`}
      >
        <div className="flex flex-col items-center rounded-md bg-(--surface-2) px-3 py-2 sm:px-4 sm:py-2.5">
          <span
            className="text-3xl font-bold tracking-tight text-(--ink) tabular-nums sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {hours}
          </span>
          <span className="n-mono text-xs text-(--muted)">horas</span>
        </div>
        <span
          aria-hidden="true"
          className="text-2xl font-bold text-(--ochre) sm:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          :
        </span>
        <div className="flex flex-col items-center rounded-md bg-(--surface-2) px-3 py-2 sm:px-4 sm:py-2.5">
          <span
            className="text-3xl font-bold tracking-tight text-(--ink) tabular-nums sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {minutes}
          </span>
          <span className="n-mono text-xs text-(--muted)">min</span>
        </div>
        <span
          aria-hidden="true"
          className="text-2xl font-bold text-(--ochre) sm:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          :
        </span>
        <div className="flex flex-col items-center rounded-md bg-(--surface-2) px-3 py-2 sm:px-4 sm:py-2.5">
          <span
            className="text-3xl font-bold tracking-tight text-(--ochre) tabular-nums sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {seconds}
          </span>
          <span className="n-mono text-xs text-(--muted)">seg</span>
        </div>
      </div>
    </div>
  );
}

function ScopeComparison({
  included,
  excluded,
}: {
  included: string[];
  excluded: string[];
}) {
  return (
    <section aria-labelledby="credits-scope-title" className="space-y-6">
      <div className="space-y-2">
        <h2 id="credits-scope-title" className="n-head">
          Qué cubre el crédito
        </h2>
        <p className="max-w-2xl text-(--muted)">
          Estos créditos aplican directamente a tu cuenta de facturación en
          Google Cloud Platform, no a la facturación de API de AI Studio.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <article className="n-panel border-l-4 border-l-(--g-green) p-6">
          <h3
            className="text-xl font-semibold text-(--ink)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Incluido: Google Cloud Platform
          </h3>
          <ul className="mt-4 space-y-3 text-(--ink)">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-(--g-green)"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="n-panel border-l-4 border-l-(--g-red) p-6">
          <h3
            className="text-xl font-semibold text-(--ink)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            No incluido: Google AI Studio
          </h3>
          <ul className="mt-4 space-y-3 text-(--ink)">
            {excluded.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-(--g-red)"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function FaqSection({ faqs }: { faqs: EventGcpCreditsConfig["faqs"] }) {
  return (
    <section aria-labelledby="credits-faq-title" className="space-y-6">
      <h2 id="credits-faq-title" className="n-head">
        Preguntas frecuentes
      </h2>

      <dl className="grid gap-4 md:grid-cols-2">
        {faqs.map((item) => (
          <div key={item.question} className="n-panel p-6">
            <dt className="text-base font-semibold text-(--ink)">
              {item.question}
            </dt>
            <dd className="mt-2.5 text-sm leading-relaxed text-(--muted)">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GcpCreditsPage({ config, initialNowMs }: Props) {
  const previewAnchorMs = useMemo(() => {
    if (typeof initialNowMs === "number") return null;
    if (typeof window === "undefined") return null;
    return resolvePreviewTimeMs(window.location.search, import.meta.env.DEV);
  }, [initialNowMs]);

  const [nowMs, setNowMs] = useState<number>(() => {
    if (typeof initialNowMs === "number") return initialNowMs;
    if (previewAnchorMs !== null) return previewAnchorMs;
    return getServerNowMs();
  });

  useEffect(() => {
    if (typeof initialNowMs === "number") {
      const startedAt = Date.now();
      const tick = window.setInterval(() => {
        setNowMs(initialNowMs + (Date.now() - startedAt));
      }, 1000);
      return () => window.clearInterval(tick);
    }

    if (previewAnchorMs !== null) {
      const startedAt = Date.now();
      const tick = window.setInterval(() => {
        setNowMs(previewAnchorMs + (Date.now() - startedAt));
      }, 1000);
      return () => window.clearInterval(tick);
    }

    let cancelled = false;
    const sync = () => {
      void syncServerClock().then(() => {
        if (!cancelled) setNowMs(getServerNowMs());
      });
    };

    sync();

    const tick = window.setInterval(() => {
      setNowMs(getServerNowMs());
    }, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setNowMs(getServerNowMs());
        sync();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [initialNowMs, previewAnchorMs]);

  const windowState = getCreditWindowState(nowMs, config);
  const countdown = splitCountdown(windowState.remainingMs);
  const peruTime = formatPeruTime(nowMs);

  if (windowState.phase === "closed") {
    return (
      <div className="space-y-8">
        <section
          aria-labelledby="credits-closed-title"
          className="n-panel n-marks p-8 sm:p-10"
        >
          <p className="n-mono text-sm text-(--muted)">
            Ventana finalizada · {config.dateLabel} · {config.viewPeriodLabel}
          </p>
          <h2 id="credits-closed-title" className="n-head mt-3">
            El acceso a los créditos cerró
          </h2>
          <p className="mt-4 max-w-2xl text-(--muted)">
            La jornada de créditos de Google Cloud para {config.eventTitle}{" "}
            estuvo disponible el {config.dateLabel} de {config.viewPeriodLabel}.
            Los enlaces de canje y la guía temporal ya no están activos.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={`/events/${config.eventSlug}`} className="nb">
              <span className="nb__label">Volver a {config.eventTitle}</span>
            </a>
            <a href="/events" className="nb nb--ghost">
              <span className="nb__label">Ver más eventos</span>
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-14 sm:space-y-20">
      <section
        aria-label="Estado de la ventana de créditos"
        className="n-panel n-marks p-6 sm:p-8"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  windowState.phase === "active"
                    ? "bg-(--g-green)"
                    : "bg-(--ochre)"
                }`}
              />
              <p className="n-mono text-sm text-(--ink)">
                {windowState.phase === "before" &&
                  "Acceso programado · Apertura automática a las 08:00 PET"}
                {windowState.phase === "active" &&
                  "Canje habilitado · Enlaces válidos por 12 horas"}
                {windowState.phase === "grace" &&
                  "Canje de Google finalizado · Guía en consulta hasta las 22:00 PET"}
              </p>
            </div>

            <p className="max-w-2xl text-(--muted)">
              {windowState.phase === "before" &&
                "Los enlaces y códigos QR se desbloquearán automáticamente en esta pantalla al llegar las 08:00 sin necesidad de recargar."}
              {windowState.phase === "active" && config.workshopHint}
              {windowState.phase === "grace" &&
                "La ventana de 12 horas de Google (08:00 – 20:00) ya cerró. Mantenemos disponible el manual paso a paso hasta las 22:00 PET para que puedas verificar tu cuenta de facturación en Google Cloud Console."}
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm text-(--muted)">
              <span>
                Hora Perú (PET):{" "}
                <strong className="n-mono text-(--ink)">{peruTime}</strong>
              </span>
              <span>
                Ventana de canje:{" "}
                <strong className="n-mono text-(--ink)">
                  {config.dateLabel} · {config.creditsPeriodLabel}
                </strong>
              </span>
            </div>
          </div>

          <CountdownReadout
            hours={countdown.hours}
            minutes={countdown.minutes}
            seconds={countdown.seconds}
            label={
              windowState.phase === "before"
                ? "Se habilita en"
                : windowState.phase === "active"
                  ? "Tiempo restante de canje"
                  : "Esta guía cierra en"
            }
          />
        </div>

        {windowState.phase === "active" && (
          <div className="mt-6 space-y-2 border-t border-(--line) pt-4">
            <div className="flex items-center justify-between gap-2 text-xs text-(--muted)">
              <span className="n-mono whitespace-nowrap">08:00 PET</span>
              <span className="n-mono text-center">
                {windowState.creditsProgressPercent}% transcurrido
              </span>
              <span className="n-mono whitespace-nowrap">20:00 PET</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)"
              role="progressbar"
              aria-label="Progreso de la ventana de canje de créditos"
              aria-valuenow={windowState.creditsProgressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-(--ochre) transition-[width] duration-500"
                style={{ width: `${windowState.creditsProgressPercent}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <section
        aria-labelledby="gmail-rule-title"
        className="n-panel border-l-4 border-l-(--ochre) p-6 sm:p-7"
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h2
              id="gmail-rule-title"
              className="text-lg font-semibold text-(--ink)"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Solo cuentas @gmail.com
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-(--muted)">
              Todos los asistentes deben usar una cuenta personal terminada en{" "}
              <strong className="n-mono text-(--ink)">@gmail.com</strong>. No se
              admiten cuentas de Google Workspace ni correos institucionales.
            </p>
          </div>
          <div>
            <h3
              className="text-lg font-semibold text-(--ink)"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Un canje por cuenta
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-(--muted)">
              Cada asistente puede canjear créditos una sola vez con la misma
              cuenta <span className="n-mono text-(--ink)">@gmail.com</span>.
              Para activar otra cuenta deberá usar otro correo personal.
            </p>
          </div>
          <div>
            <h3
              className="text-lg font-semibold text-(--ink)"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Canjea antes del taller
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-(--muted)">
              Hazlo durante el registro (08:00 – 09:00) para evitar retrasos; la
              cuenta de facturación puede tardar hasta 5 minutos en reflejarse.
            </p>
          </div>
        </div>
      </section>

      {windowState.phase === "active" && (
        <GcpCreditsVault
          primary={config.primaryLink}
          backup={config.backupLink}
        />
      )}

      {(windowState.phase === "active" || windowState.phase === "grace") && (
        <GcpCreditsManual
          phases={config.phases}
          steps={config.steps}
          initialStepNumber={windowState.phase === "grace" ? 11 : 1}
        />
      )}

      <ScopeComparison included={config.included} excluded={config.excluded} />

      <FaqSection faqs={config.faqs} />
    </div>
  );
}
