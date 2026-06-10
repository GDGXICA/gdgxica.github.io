import { useEffect, useState } from "react";

// Filtra las tarjetas de evento renderizadas en el servidor mostrando/ocultando
// los wrappers [data-event-card] según búsqueda + categoría + estado.
// No re-renderiza las tarjetas: solo togglea la clase `hidden`.

const CATEGORIES: { value: string; label: string }[] = [
  { value: "devfest", label: "DevFest" },
  { value: "io", label: "Google I/O" },
  { value: "studyjam", label: "Study Jam" },
  { value: "wtm", label: "Women Techmakers" },
  { value: "meetup", label: "Meetup" },
];

const STATUSES: { value: string; label: string }[] = [
  { value: "upcoming", label: "Próximo" },
  { value: "in-progress", label: "En progreso" },
  { value: "completed", label: "Finalizado" },
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function EventFilters() {
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    const cards = document.querySelectorAll<HTMLElement>("[data-event-card]");
    let visible = 0;

    cards.forEach((card) => {
      const name = card.dataset.name ?? "";
      const tags = card.dataset.tags ?? "";
      const category = card.dataset.category ?? "";
      const status = card.dataset.status ?? "";

      const matchesSearch = !q || name.includes(q) || tags.includes(q);
      const matchesCategory =
        activeCategories.length === 0 || activeCategories.includes(category);
      const matchesStatus =
        activeStatuses.length === 0 || activeStatuses.includes(status);

      const show = matchesSearch && matchesCategory && matchesStatus;
      card.classList.toggle("hidden", !show);
      if (show) visible += 1;
    });

    const empty = document.getElementById("events-empty");
    if (empty) empty.classList.toggle("hidden", visible !== 0);
  }, [search, activeCategories, activeStatuses]);

  const hasFilters =
    search !== "" || activeCategories.length > 0 || activeStatuses.length > 0;

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-google-blue border-google-blue text-white"
        : "border-gray-custom text-primary bg-white hover:bg-gray-100"
    }`;

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <label className="sr-only" htmlFor="event-search">
        Buscar eventos
      </label>
      <input
        id="event-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        placeholder="Buscar por nombre o tema…"
        className="border-gray-custom focus:border-google-blue w-full rounded-md border px-4 py-3 outline-none"
      />

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={activeCategories.includes(c.value)}
            onClick={() => setActiveCategories((prev) => toggle(prev, c.value))}
            className={chipClass(activeCategories.includes(c.value))}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={activeStatuses.includes(s.value)}
            onClick={() => setActiveStatuses((prev) => toggle(prev, s.value))}
            className={chipClass(activeStatuses.includes(s.value))}
          >
            {s.label}
          </button>
        ))}
      </div>

      {hasFilters && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setActiveCategories([]);
              setActiveStatuses([]);
            }}
            className="text-secondary hover:text-primary text-sm underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
