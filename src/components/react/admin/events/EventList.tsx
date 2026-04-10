import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";

interface EventSummary {
  id: string;
  title: string;
  date: string;
  venue: string;
  topics: string[];
}

export function EventList() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    const res = await api.listEvents();
    if (res.success && res.data) {
      setEvents(res.data as EventSummary[]);
    } else {
      setError(res.error || "Error al cargar eventos");
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(`Estas seguro de eliminar el evento "${id}"?`)) return;
    setDeleting(id);
    const res = await api.deleteEvent(id);
    if (res.success) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setToast({ message: "Evento eliminado", type: "success" });
    } else {
      setToast({
        message: res.error || "Error al eliminar",
        type: "error",
      });
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
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

      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">{events.length} eventos</p>
        <a
          href="/admin/eventos/nuevo"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Crear evento
        </a>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Evento
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Sede
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-500">{event.id}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {event.date}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {event.venue || "Virtual"}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <a
                      href={`/admin/eventos/nuevo?edit=${event.id}`}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </a>
                    <button
                      onClick={() => handleDelete(event.id)}
                      disabled={deleting === event.id}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting === event.id ? "..." : "Eliminar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <p className="py-8 text-center text-gray-500">
            No hay eventos. Crea el primero.
          </p>
        )}
      </div>
    </div>
  );
}
