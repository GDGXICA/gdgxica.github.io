import type { MinigameType } from "../minigame-templates/types";

export type InstanceState = "scheduled" | "live" | "closed";
export type InstanceMode = "global" | "realtime";

export interface MinigameInstance {
  id: string;
  eventSlug: string;
  templateId: string;
  templateVersion: number;
  type: MinigameType;
  mode: InstanceMode;
  state: InstanceState;
  title: string;
  order: number;
  config?: Record<string, unknown>;
  currentQuestionIndex?: number;
}

export const STATE_LABELS: Record<InstanceState, string> = {
  scheduled: "Programado",
  live: "En vivo",
  closed: "Cerrado",
};

export const STATE_COLORS: Record<InstanceState, string> = {
  scheduled: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  live: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const MODE_LABELS: Record<InstanceMode, string> = {
  global: "Global",
  realtime: "En tiempo real",
};
