import { TtlCache } from "./ttlCache";

export type CachedInstanceData = Record<string, unknown> | null;
export type CachedQuizAnswers = Record<string, string> | null;
export interface CachedLiveInstanceEntry {
  id: string;
  data: Record<string, unknown>;
}

const instanceCache = new TtlCache<CachedInstanceData>(1500);
const liveInstancesCache = new TtlCache<CachedLiveInstanceEntry[]>(1500);
const quizSecretCache = new TtlCache<CachedQuizAnswers>(15 * 60_000);
const participantMembershipCache = new TtlCache<boolean>(
  15 * 60_000,
  () => Date.now(),
  5000
);

function instanceKey(slug: string, id: string): string {
  return `${slug}:${id}`;
}

function participantKey(slug: string, id: string, uid: string): string {
  return `${slug}:${id}:${uid}`;
}

export function getOrLoadInstance(
  slug: string,
  id: string,
  loader: () => Promise<CachedInstanceData>
): Promise<CachedInstanceData> {
  return instanceCache.getOrLoad(
    instanceKey(slug, id),
    loader,
    (value) => value !== null
  );
}

export function reloadInstanceIfStale(
  slug: string,
  id: string,
  staleValue: CachedInstanceData,
  loader: () => Promise<CachedInstanceData>
): Promise<CachedInstanceData> {
  return instanceCache.reloadIfStale(
    instanceKey(slug, id),
    staleValue,
    loader,
    (value) => value !== null
  );
}

export function getOrLoadQuizAnswers(
  slug: string,
  id: string,
  loader: () => Promise<CachedQuizAnswers>
): Promise<CachedQuizAnswers> {
  return quizSecretCache.getOrLoad(
    instanceKey(slug, id),
    loader,
    (value) => value !== null
  );
}

export function getOrLoadParticipantMembership(
  slug: string,
  id: string,
  uid: string,
  loader: () => Promise<boolean>
): Promise<boolean> {
  return participantMembershipCache.getOrLoad(
    participantKey(slug, id, uid),
    loader,
    (value) => value === true
  );
}

export function markParticipantJoined(
  slug: string,
  id: string,
  uid: string
): void {
  participantMembershipCache.set(participantKey(slug, id, uid), true);
}

export function getOrLoadLiveInstances(
  slug: string,
  loader: () => Promise<CachedLiveInstanceEntry[]>
): Promise<CachedLiveInstanceEntry[]> {
  return liveInstancesCache.getOrLoad(slug, loader);
}

export function invalidateLiveInstancesCache(slug: string): void {
  liveInstancesCache.invalidate(slug);
}

export function invalidateInstanceCache(slug: string, id: string): void {
  const key = instanceKey(slug, id);
  instanceCache.invalidate(key);
  quizSecretCache.invalidate(key);
  liveInstancesCache.invalidate(slug);
}

export function clearMinigameCaches(): void {
  instanceCache.clear();
  liveInstancesCache.clear();
  quizSecretCache.clear();
  participantMembershipCache.clear();
}
