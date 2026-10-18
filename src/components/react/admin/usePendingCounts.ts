import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Permission } from "@/lib/permissions";

export type PendingKey = "proposals" | "access" | "drafts";

export interface Pending {
  key: PendingKey;
  label: string;
  href: string;
  count: number | null;
  failed: boolean;
}

const SOURCES: {
  key: PendingKey;
  label: string;
  href: string;
  permission: Permission;
  load: () => Promise<number>;
}[] = [
  {
    key: "proposals",
    label: "Propuestas por revisar",
    href: "/admin/proposals",
    permission: "proposals:review",
    load: async () => {
      const res = await api.listProposals();
      if (!res.success) throw new Error();
      return ((res.data ?? []) as { status: string }[]).filter(
        (p) => p.status === "submitted"
      ).length;
    },
  },
  {
    key: "access",
    label: "Solicitudes de acceso",
    href: "/admin/access",
    permission: "access:review",
    load: async () => {
      const res = await api.listAccessRequests("pending");
      if (!res.success) throw new Error();
      return ((res.data ?? []) as unknown[]).length;
    },
  },
  {
    key: "drafts",
    label: "Posts en borrador",
    href: "/admin/posts",
    permission: "posts:write",
    load: async () => {
      const res = await api.listPosts();
      if (!res.success) throw new Error();
      return ((res.data ?? []) as { status: string }[]).filter(
        (p) => p.status === "draft"
      ).length;
    },
  },
];

const cache = new Map<PendingKey, Promise<number>>();

function load(key: PendingKey, run: () => Promise<number>): Promise<number> {
  let promise = cache.get(key);
  if (!promise) {
    promise = run();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

export function usePendingCounts(can: (p: Permission) => boolean): Pending[] {
  const [sources] = useState(() =>
    SOURCES.filter((source) => can(source.permission))
  );
  const [items, setItems] = useState<Pending[]>(() =>
    sources.map(({ key, label, href }) => ({
      key,
      label,
      href,
      count: null,
      failed: false,
    }))
  );

  useEffect(() => {
    let cancelled = false;
    const patch = (key: PendingKey, change: Partial<Pending>) =>
      setItems((prev) =>
        prev.map((p) => (p.key === key ? { ...p, ...change } : p))
      );
    for (const source of sources) {
      load(source.key, source.load)
        .then((count) => !cancelled && patch(source.key, { count }))
        .catch(() => !cancelled && patch(source.key, { failed: true }));
    }
    return () => {
      cancelled = true;
    };
  }, [sources]);

  return items;
}
