import { useEffect, useState } from "react";
import { CATEGORY_DOT, STATUS_DOT } from "@/lib/categories";

// Filtra las tarjetas de evento renderizadas en el servidor mostrando/ocultando
// los wrappers [data-event-card] según búsqueda + categoría + estado.
// No re-renderiza las tarjetas: solo togglea la clase `hidden`, y la de
// #events-empty cuando no queda ninguna.

// The shared colour codes, so a chip here matches the chip on the cards it
// selects.
const CATEGORIES: { value: string; label: string; dot: string }[] = [
  { value: "devfest", label: "DevFest", dot: CATEGORY_DOT.devfest },
  { value: "io", label: "Google I/O", dot: CATEGORY_DOT.io },
  { value: "studyjam", label: "Study Jam", dot: CATEGORY_DOT.studyjam },
  { value: "wtm", label: "Women Techmakers", dot: CATEGORY_DOT.wtm },
  { value: "meetup", label: "Meetup", dot: CATEGORY_DOT.meetup },
];

const STATUSES: { value: string; label: string; dot: string }[] = [
  { value: "upcoming", label: "Próximo", dot: STATUS_DOT.upcoming },
  {
    value: "in-progress",
    label: "En progreso",
    dot: STATUS_DOT["in-progress"],
  },
  { value: "completed", label: "Finalizado", dot: STATUS_DOT.completed },
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-(--muted)"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

interface Chip {
  value: string;
  label: string;
  dot: string;
}

function ChipGroup({
  id,
  label,
  chips,
  active,
  onToggle,
}: {
  id: string;
  label: string;
  chips: Chip[];
  active: string[];
  onToggle: (value: string) => void;
}) {
  // On a phone each group is one row that scrolls sideways, bled to the
  // screen edge so the cut-off chip shows there is more; from `sm` up the
  // chips wrap beside their label. The vertical padding keeps the focus
  // outline inside the scroller, which would otherwise clip it.
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row sm:items-start sm:gap-3"
    >
      <span
        id={id}
        className="flex-none text-[0.9375rem] text-(--muted) sm:flex sm:min-h-11 sm:min-w-14 sm:items-center"
      >
        {label}
      </span>
      <div className="-mx-(--margin) -my-1.5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-(--margin) py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {chips.map((chip) => {
          const on = active.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(chip.value)}
              className={`inline-flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-(--radius-sm) border px-3.5 text-[0.9375rem] leading-tight font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 ${
                on
                  ? "border-(--ochre) bg-(--ochre) text-(--ochre-ink)"
                  : "border-(--line-strong) bg-(--surface-1) text-(--ink) hover:bg-(--surface-2)"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 flex-none rounded-full ${
                  on ? "ring-2 ring-(--ochre-ink)/40" : ""
                }`}
                style={{ background: chip.dot }}
              />
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  /** How many events the page lists, for the result count. */
  total: number;
}

export function EventFilters({ total }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(total);

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
    setVisibleCount(visible);
  }, [search, activeCategories, activeStatuses]);

  const hasFilters =
    search !== "" || activeCategories.length > 0 || activeStatuses.length > 0;

  const clear = () => {
    setSearch("");
    setActiveCategories([]);
    setActiveStatuses([]);
  };

  return (
    <div
      role="search"
      aria-label="Filtrar eventos"
      className="border-y border-(--line) py-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="relative w-full sm:max-w-md sm:flex-1">
          <label className="sr-only" htmlFor="event-search">
            Buscar eventos
          </label>
          <SearchIcon />
          <input
            id="event-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Buscar por nombre o tema…"
            autoComplete="off"
            className="min-h-12 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-1) py-2.5 pr-4 pl-11 text-(--ink) transition-[border-color] duration-150 placeholder:text-(--muted) hover:border-(--muted)"
          />
        </div>

        <div className="flex items-center gap-5">
          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="n-link min-h-11 cursor-pointer border-0 bg-transparent px-1"
            >
              Limpiar filtros
            </button>
          )}
          <p className="n-mono m-0 text-(--muted)" aria-live="polite">
            {hasFilters ? (
              <>
                <span className="text-(--ochre)">{visibleCount}</span> de{" "}
                {total} eventos
              </>
            ) : (
              <>{total} eventos</>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <ChipGroup
          id="event-filter-category"
          label="Tipo"
          chips={CATEGORIES}
          active={activeCategories}
          onToggle={(value) =>
            setActiveCategories((prev) => toggle(prev, value))
          }
        />
        <ChipGroup
          id="event-filter-status"
          label="Estado"
          chips={STATUSES}
          active={activeStatuses}
          onToggle={(value) => setActiveStatuses((prev) => toggle(prev, value))}
        />
      </div>
    </div>
  );
}
