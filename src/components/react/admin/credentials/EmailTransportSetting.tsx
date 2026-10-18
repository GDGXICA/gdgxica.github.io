import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { SectionHeading } from "../ui/atlas";

type Transport = "gmail" | "resend";

interface Props {
  onError: (message: string) => void;
}

const LABELS: Record<Transport, { name: string; sender: string }> = {
  gmail: { name: "Gmail", sender: "Sale desde tu cuenta de Gmail" },
  resend: { name: "Resend", sender: "Sale desde el dominio de GDG Ica" },
};

/**
 * Picks which service sends credential email.
 *
 * Admin-only, and the API enforces it — hiding the control is cosmetic.
 *
 * The sender address is not a separate choice: it follows the transport.
 * Email authentication forbids sending as a gmail.com address through a
 * third party, so "which sender" and "which service" are the same
 * question. Replies reach the same inbox either way.
 *
 * The switch takes effect on the next drain run, within five minutes, and
 * needs no deploy — which is the point. If the provider starts failing
 * during the event, going back is a click.
 */
export function EmailTransportSetting({ onError }: Props) {
  const { can } = useAuth();
  const [transport, setTransport] = useState<Transport | null>(null);
  const [dailyCap, setDailyCap] = useState<number | null>(null);
  const [resendReady, setResendReady] = useState(true);
  const [busy, setBusy] = useState(false);

  const allowed = can("email:transport");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      const res = await api.getEmailSettings();
      if (cancelled) return;
      if (res.success && res.data) {
        setTransport(res.data.transport);
        setDailyCap(res.data.dailyCap);
        setResendReady(res.data.resendConfigured);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed || !transport) return null;

  const change = async (next: Transport) => {
    if (next === transport) return;
    setBusy(true);
    const res = await api.setEmailTransport(next);
    setBusy(false);

    if (!res.success || !res.data) {
      onError(
        res.error ??
          `No se pudo cambiar el envío a ${LABELS[next].name}. Sigue saliendo por ${LABELS[transport].name}.`
      );
      return;
    }
    setTransport(res.data.transport);
    setDailyCap(res.data.dailyCap);
  };

  return (
    <section
      aria-labelledby="credenciales-correo"
      className="min-w-[min(100%,18rem)] flex-1"
    >
      <SectionHeading>
        <span id="credenciales-correo">Envío de correos</span>
      </SectionHeading>

      <div
        role="group"
        aria-label="Servicio de envío"
        className="border-atlas-line inline-flex rounded-md border p-1"
      >
        {(Object.keys(LABELS) as Transport[]).map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => change(option)}
            aria-pressed={transport === option}
            className={`rounded px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              transport === option
                ? "bg-atlas-deep text-atlas-dust"
                : "text-atlas-mist hover:text-atlas-dust"
            }`}
          >
            {LABELS[option].name}
          </button>
        ))}
      </div>

      <p className="text-atlas-dust mt-3 text-sm">
        {LABELS[transport].sender}
        {dailyCap !== null && (
          <span className="text-atlas-mist">
            {" "}
            · hasta <span className="tabular-nums">{dailyCap}</span> correos al
            día
          </span>
        )}
      </p>
      {!resendReady && (
        <p className="border-atlas-glow/40 text-atlas-mist mt-3 rounded-md border px-3 py-2 text-sm">
          <span className="text-atlas-glow font-semibold">
            Resend no tiene clave.
          </span>{" "}
          Si lo eliges, los envíos quedan en cola reintentando hasta que se
          configure una válida.
        </p>
      )}
      <p className="text-atlas-fog mt-3 text-sm">
        Las respuestas llegan a tu correo con cualquiera de los dos. Al pasar el
        límite diario la cola sigue al día siguiente; nadie se queda sin
        credencial.
      </p>
    </section>
  );
}
