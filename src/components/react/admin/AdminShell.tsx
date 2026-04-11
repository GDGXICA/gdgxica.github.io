import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Eventos", href: "/admin/eventos", icon: "📅" },
  { label: "Equipo", href: "/admin/equipo", icon: "👥", adminOnly: true },
  { label: "Speakers", href: "/admin/speakers", icon: "🎤" },
  { label: "Sponsors", href: "/admin/sponsors", icon: "🤝", adminOnly: true },
  { label: "Usuarios", href: "/admin/usuarios", icon: "👤", adminOnly: true },
  { label: "Stats", href: "/admin/stats", icon: "📈", adminOnly: true },
  { label: "Formularios", href: "/admin/forms", icon: "📋" },
];

interface Props {
  currentPage: string;
  children: React.ReactNode;
}

export function AdminShell({ currentPage, children }: Props) {
  const { user, role, signOut, isAdmin } = useAuth();
  const [dark, setDark] = useState(false);

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

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="hidden w-64 border-r border-gray-200 bg-white lg:block dark:border-gray-700 dark:bg-gray-800">
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6 dark:border-gray-700">
          <img src="/gdg-logo.png" alt="GDG ICA" className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              GDG ICA
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Admin Panel
            </p>
          </div>
        </div>
        <nav className="p-4">
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
        <div className="absolute bottom-0 w-64 space-y-3 border-t border-gray-200 p-4 dark:border-gray-700">
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
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentPage === "/admin"
              ? "Dashboard"
              : visibleItems.find((i) => i.href === currentPage)?.label ||
                "Admin"}
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 lg:hidden dark:text-gray-400 dark:hover:bg-gray-700"
            >
              {dark ? "☀️" : "🌙"}
            </button>
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

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
