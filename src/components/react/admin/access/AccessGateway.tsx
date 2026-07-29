import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "../AuthProvider";
import { LoginScreen } from "../LoginScreen";
import { api } from "@/lib/api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";

const REQUESTABLE: Role[] = ["contributor", "volunteer", "organizer"];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

/** Formulario público de solicitud de acceso. */
function RequestForm() {
  const { user, loading, canAccessPanel } = useAuth();
  const [existing, setExisting] = useState<{ status: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<Role>("contributor");
  const [motivo, setMotivo] = useState("");
  const [links, setLinks] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    api.getMyAccessRequest().then((res) => {
      if (res.success && res.data) {
        setExisting(res.data as { status: string });
      }
      setChecking(false);
    });
  }, [user]);

  if (loading || checking) return <Spinner />;
  if (!user) return <LoginScreen />;

  if (canAccessPanel) {
    return (
      <Card>
        <p className="text-4xl">✅</p>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Ya tienes acceso
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Tu cuenta ya puede operar la plataforma.
        </p>
        <a
          href="/admin"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Ir al panel
        </a>
      </Card>
    );
  }

  if (sent || existing?.status === "pending") {
    return (
      <Card>
        <p className="text-4xl">⏳</p>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Solicitud enviada
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Un administrador la revisará y te avisaremos por correo a {user.email}
          .
        </p>
        <a
          href="/"
          className="mt-6 inline-block text-sm text-gray-500 underline dark:text-gray-400"
        >
          Volver al sitio
        </a>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const res = await api.createAccessRequest({
      requestedRole: role,
      motivo: motivo.trim(),
      links: links.trim(),
      eventSlug: eventSlug.trim() || undefined,
    });
    if (res.success) setSent(true);
    else setError(res.error || "No se pudo enviar la solicitud");
    setSending(false);
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <Card>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        Solicitar acceso
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Cuéntanos cómo quieres colaborar con la comunidad GDG ICA. Entras como{" "}
        {user.email}.
      </p>
      {existing?.status === "rejected" && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Tu solicitud anterior no fue aprobada. Puedes volver a enviarla con
          más detalle.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            ¿Cómo quieres participar?
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputClass}
          >
            {REQUESTABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            {ROLE_DESCRIPTIONS[role]}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Motivo <span className="text-red-500">*</span>
          </span>
          <textarea
            required
            rows={4}
            maxLength={1000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Qué te gustaría aportar y por qué"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Enlaces (opcional)
          </span>
          <input
            type="text"
            maxLength={1000}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="GitHub, LinkedIn, portafolio..."
            className={inputClass}
          />
        </label>

        {role === "volunteer" && (
          <label className="block">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Evento en el que quieres ayudar (opcional)
            </span>
            <input
              type="text"
              maxLength={100}
              value={eventSlug}
              onChange={(e) => setEventSlug(e.target.value)}
              placeholder="devfest-2026"
              className={inputClass}
            />
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={sending || motivo.trim().length === 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar solicitud"}
        </button>
      </form>
    </Card>
  );
}

/** Canje de una invitación recibida por correo. */
function RedeemForm() {
  const { user, loading } = useAuth();
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [grantedRole, setGrantedRole] = useState<string | null>(null);

  // El token viene en la URL; se lee una vez al montar.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) setToken(fromUrl);
  }, []);

  if (loading) return <Spinner />;
  if (!user) return <LoginScreen />;

  if (state === "done") {
    return (
      <Card>
        <p className="text-4xl">🎉</p>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Invitación aceptada
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Tu cuenta ahora es{" "}
          <strong>{ROLE_LABELS[grantedRole as Role] ?? grantedRole}</strong>.
        </p>
        <a
          href="/admin"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Ir al panel
        </a>
      </Card>
    );
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const res = await api.redeemInvitation(token.trim());
    if (res.success) {
      setGrantedRole((res.data as { role: string })?.role ?? null);
      setState("done");
    } else {
      setError(res.error || "No se pudo canjear la invitación");
      setState("idle");
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        Aceptar invitación
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Has entrado como <strong>{user.email}</strong>. La invitación solo
        funciona con la dirección a la que se envió; si no es esta, cierra
        sesión y entra con la correcta.
      </p>

      <form onSubmit={redeem} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Código de invitación
          </span>
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "sending" || token.trim().length === 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state === "sending" ? "Comprobando..." : "Aceptar invitación"}
        </button>
      </form>
    </Card>
  );
}

/**
 * Pantallas de entrada a la plataforma para quien todavía no tiene permisos.
 * Van fuera del AdminShell a propósito: quien las usa aún no puede pasar de
 * la puerta del panel.
 */
export function AccessGateway({ mode }: { mode: "request" | "redeem" }) {
  return (
    <AuthProvider>
      {mode === "request" ? <RequestForm /> : <RedeemForm />}
    </AuthProvider>
  );
}
