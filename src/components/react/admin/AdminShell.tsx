import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Eventos", href: "/admin/eventos", icon: "📅" },
  { label: "Equipo", href: "/admin/equipo", icon: "👥", adminOnly: true },
  { label: "Speakers", href: "/admin/speakers", icon: "🎤" },
  { label: "Ubicaciones", href: "/admin/ubicaciones", icon: "📍" },
  { label: "Sponsors", href: "/admin/sponsors", icon: "🤝", adminOnly: true },
  { label: "Usuarios", href: "/admin/usuarios", icon: "👤", adminOnly: true },
  { label: "Stats", href: "/admin/stats", icon: "📈", adminOnly: true },
  { label: "Formularios", href: "/admin/forms", icon: "📋" },
  {
    label: "Minijuegos",
    href: "/admin/minigame-templates",
    icon: "🎮",
    adminOnly: true,
  },
];

interface Props {
  currentPage: string;
  children: React.ReactNode;
}

export function AdminShell({ currentPage, children }: Props) {
  const { user, role, signOut, isAdmin } = useAuth();
  const [dark, setDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("admin-theme", next ? "dark" : "light");
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6 dark:border-gray-700">
        <img src="/gdg-logo.png" alt="GDG ICA" className="h-8 w-8" />
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            GDG ICA
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Admin Panel
          </p>
        </div>
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 lg:hidden dark:text-gray-400 dark:hover:bg-gray-700"
        >
          ✕
        </button>
      </div>
      <nav className="flex-1 overflow-auto p-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  currentPage === item.href
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-3 border-t border-gray-200 p-4 dark:border-gray-700">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {dark ? "☀️ Modo claro" : "🌙 Modo oscuro"}
        </button>
        <a
          href="/"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Volver al sitio
        </a>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-700 dark:bg-gray-800">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white dark:bg-gray-800">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden dark:text-gray-400 dark:hover:bg-gray-700"
              aria-label="Abrir menú"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentPage === "/admin"
                ? "Dashboard"
                : visibleItems.find((i) => i.href === currentPage)?.label ||
                  "Admin"}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.displayName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{role}</p>
            </div>
            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            )}
            <button
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Salir
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
