export type MinigameType = "poll" | "quiz" | "wordcloud" | "bingo";

export interface OptionItem {
  id: string;
  label: string;
}

export interface PollConfig {
  question: string;
  options: OptionItem[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: OptionItem[];
  correctOptionId: string;
  timeLimitSec: number;
  points: number;
}

export interface QuizConfig {
  questions: QuizQuestion[];
}

export interface WordCloudConfig {
  prompt: string;
  maxWordsPerUser: number;
  maxLength: number;
}

export interface BingoConfig {
  terms: string[];
  cardSize: 4;
  freeCenter: boolean;
}

interface BaseTemplate {
  id?: string;
  title: string;
  description: string;
  version?: number;
  updatedAt?: { seconds?: number } | string | null;
}

export type Template =
  | (BaseTemplate & { type: "poll"; poll: PollConfig })
  | (BaseTemplate & { type: "quiz"; quiz: QuizConfig })
  | (BaseTemplate & { type: "wordcloud"; wordcloud: WordCloudConfig })
  | (BaseTemplate & { type: "bingo"; bingo: BingoConfig });

export const TYPE_LABELS: Record<MinigameType, string> = {
  poll: "Encuesta",
  quiz: "Quiz",
  wordcloud: "Nube de palabras",
  bingo: "Bingo",
};

export const TYPE_COLORS: Record<MinigameType, string> = {
  poll: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  quiz: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  wordcloud:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  bingo: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

function makeId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for very old browsers / non-secure contexts.
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export const newOptionId = makeId;
export const newQuestionId = makeId;

export function emptyForType(type: MinigameType): Template {
  switch (type) {
    case "poll":
      return {
        type: "poll",
        title: "",
        description: "",
        poll: {
          question: "",
          options: [
            { id: makeId(), label: "" },
            { id: makeId(), label: "" },
          ],
        },
      };
    case "quiz":
      return {
        type: "quiz",
        title: "",
        description: "",
        quiz: {
          questions: [
            {
              id: makeId(),
              prompt: "",
              options: [
                { id: makeId(), label: "" },
                { id: makeId(), label: "" },
              ],
              correctOptionId: "",
              timeLimitSec: 30,
              points: 100,
            },
          ],
        },
      };
    case "wordcloud":
      return {
        type: "wordcloud",
        title: "",
        description: "",
        wordcloud: {
          prompt: "",
          maxWordsPerUser: 3,
          maxLength: 60,
        },
      };
    case "bingo":
      return {
        type: "bingo",
        title: "",
        description: "",
        bingo: {
          terms: [],
          cardSize: 4,
          freeCenter: false,
        },
      };
  }
}

export const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400";
