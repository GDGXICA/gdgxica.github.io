import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  effectivePermissions,
  type Permission,
  type PermissionSubject,
} from "@/lib/permissions";

/** One of the caller's event assignments, as `GET /api/me/events` returns it. */
export interface MyAssignment {
  eventSlug: string;
  role: string | null;
  expiresAt?: unknown;
  /** What this assignment grants; `null` = the role's whole bundle. */
  permissions: Permission[] | null;
}

// One request per page load, shared by every component that asks (the
// shell, the dashboard, the event picker). A failed request is dropped from
// the cache so a retry asks again.
let cache: Promise<MyAssignment[]> | null = null;

function load(): Promise<MyAssignment[]> {
  if (!cache) {
    cache = api.listMyEvents().then((res) => {
      if (!res.success) throw new Error(res.error || "No se pudo cargar");
      return ((res.data ?? []) as MyAssignment[]).map((a) => ({
        ...a,
        permissions: Array.isArray(a.permissions) ? a.permissions : null,
      }));
    });
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

/** For tests: forget the cached request. */
export function resetMyAssignmentsCache(): void {
  cache = null;
}

export function useMyAssignments() {
  const [assignments, setAssignments] = useState<MyAssignment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    load()
      .then((list) => !cancelled && setAssignments(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { assignments, failed, retry };
}

/**
 * What the caller can do in ONE event: their global permissions plus what
 * their assignment there grants, computed exactly like the server does
 * (`effectivePermissions` with the assignment's list).
 */
export function eventPermissions(
  profile: PermissionSubject | null,
  assignments: readonly MyAssignment[] | null,
  slug: string
): Set<Permission> {
  if (!profile) return new Set();
  const assignment = assignments?.find((a) => a.eventSlug === slug);
  return effectivePermissions(profile, {
    scope: slug,
    isEventStaff: Boolean(assignment),
    staffPermissions: assignment ? assignment.permissions : null,
  });
}

/** `true` if any of the caller's assignments grants the permission. */
export function anyAssignmentGrants(
  profile: PermissionSubject | null,
  assignments: readonly MyAssignment[] | null,
  permission: Permission
): boolean {
  return (assignments ?? []).some((a) =>
    eventPermissions(profile, assignments, a.eventSlug).has(permission)
  );
}
