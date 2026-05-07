// Shared types for the public event island (PR4 + PR5/PR6).

import type { MinigameType } from "../admin/minigame-templates/types";
import type {
  InstanceMode,
  InstanceState,
} from "../admin/event-minigames/types";

export type { MinigameType, InstanceMode, InstanceState };

export interface LiveInstance {
  id: string;
  type: MinigameType;
  mode: InstanceMode;
  state: InstanceState;
  title: string;
  order: number;
  // Snapshotted template config — shape varies by `type`. PR5/PR6 reach
  // into the relevant subtree; PR4 only needs `type` for badges.
  config?: Record<string, unknown>;
  currentQuestionIndex?: number;
}

export interface JoinResult {
  alias: string;
  instances: {
    id: string;
    type: string;
    joined: boolean;
    bingoCard?: string[];
  }[];
}

export const LOCAL_STORAGE_ALIAS_KEY = (slug: string) =>
  `gdg_minigame_alias_${slug}`;
