import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";

interface Proposal {
  id: string;
  type: "event" | "speaker";
  status: string;
  createdBy: string;
  createdByName?: string;
  createdByEmail?: string;
  payload: Record<string, unknown>;
  reviewNote?: string | null;
  createdAt?: { _seconds: number };
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  submitted: {
    label: "En revisión",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  changes_requested: {
    label: "Requiere cambios",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  },
  approved: {
    label: "Aprobada",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  published: {
    label: "Publicada",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  rejected: {
    label: "Rechazada",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
};

function formatDate(ts: Proposal["createdAt"]): string {
  if (!ts?._seconds) return "—";
  return new Date(ts._seconds * 1000).toLocaleDateString("es-PE");
}

export function ProposalsPanel() {
  const { can } = useAuth();
  const canReview = can("proposals:review");

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<"event" | "speaker">("event");
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.listProposals();
    if (res.success && res.data) setProposals(res.data as Proposal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    let payload: unknown;
    try {
      payload = JSON.parse(draft);
    } catch {
      setToast({ message: "El contenido no es JSON válido", type: "error" });
      return;
    }
    setBusy("new");
    const res = await api.createProposal(newType, payload);
    if (res.success) {
      setToast({ message: "Propuesta enviada a revisión", type: "success" });
      setCreating(false);
      setDraft("");
      load();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function review(proposal: Proposal, decision: string) {
    let note: string | undefined;
    if (decision !== "approved") {
      const entered = prompt(
        decision === "rejected"
          ? "Motivo del rechazo (lo verá quien propuso):"
          : "Qué hay que corregir:"
      );
      if (entered === null || entered.trim().length === 0) return;
      note = entered.trim();
    }
    setBusy(proposal.id);
    const res = await api.reviewProposal(proposal.id, decision, note);
    if (res.success) {
      setToast({ message: "Propuesta revisada", type: "success" });
      load();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function publish(proposal: Proposal) {
    if (
      !confirm(
        "Publicar esta propuesta la escribe en el repositorio de datos y dispara una reconstrucción del sitio. ¿Continuar?"
      )
    )
      return;
    setBusy(proposal.id);
    const res = await api.publishProposal(proposal.id);
    if (res.success) {
      setToast({ message: "Publicada", type: "success" });
      load();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {canReview
            ? "Propuestas de contenido enviadas por la comunidad. Aprobar no publica: publicar es un segundo paso explícito."
            : "Tus propuestas. Un organizador las revisa antes de que aparezcan en el sitio."}
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {creating ? "Cancelar" : "Nueva propuesta"}
        </button>
      </div>

      {creating && (
        <form
          onSubmit={submitNew}
          className="mb-8 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm font-medium text-gray-900 dark:text-white">
              Tipo
            </label>
            <select
              value={newType}
              onChange={(e) =>
                setNewType(e.target.value as "event" | "speaker")
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="event">Evento</option>
              <option value="speaker">Speaker</option>
            </select>
          </div>
          <textarea
            required
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              newType === "event"
                ? '{\n  "id": "mi-evento",\n  "title": "Título",\n  "description": "…",\n  "date": "2026-09-01"\n}'
                : '{\n  "id": "nombre-apellido",\n  "name": "Nombre Apellido"\n}'
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Se valida contra el mismo esquema que usa el panel, así que un campo
            mal puesto se rechaza aquí y no al publicar.
          </p>
          <button
            type="submit"
            disabled={busy === "new"}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "new" ? "Enviando..." : "Enviar a revisión"}
          </button>
        </form>
      )}

      {proposals.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Todavía no hay propuestas.
        </p>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => {
            const state = STATUS[p.status] ?? {
              label: p.status,
              className: "bg-gray-100 text-gray-700",
            };
            const title =
              (p.payload?.title as string) ||
              (p.payload?.name as string) ||
              (p.payload?.id as string) ||
              "(sin título)";

            return (
              <li
                key={p.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {p.type === "event" ? "Evento" : "Speaker"}
                      {canReview &&
                        ` · ${p.createdByName || p.createdByEmail || p.createdBy}`}
                      {" · "}
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.className}`}
                  >
                    {state.label}
                  </span>
                </div>

                {p.reviewNote && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    {p.reviewNote}
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400">
                    Ver contenido
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {JSON.stringify(p.payload, null, 2)}
                  </pre>
                </details>

                {canReview && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {p.status === "submitted" && (
                      <>
                        <button
                          disabled={busy === p.id}
                          onClick={() => review(p, "approved")}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Aprobar
                        </button>
                        <button
                          disabled={busy === p.id}
                          onClick={() => review(p, "changes_requested")}
                          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                        >
                          Pedir cambios
                        </button>
                        <button
                          disabled={busy === p.id}
                          onClick={() => review(p, "rejected")}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    {p.status === "approved" && (
                      <button
                        disabled={busy === p.id}
                        onClick={() => publish(p)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Publicar en el sitio
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
