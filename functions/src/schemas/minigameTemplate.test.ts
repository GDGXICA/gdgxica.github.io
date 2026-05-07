import { describe, expect, it } from "vitest";
import { minigameTemplateSchema } from "./index";

describe("minigameTemplateSchema", () => {
  it("accepts a valid poll", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "poll",
      title: "Sample",
      description: "",
      poll: {
        question: "Pick one",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid quiz with defaults filled in", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "quiz",
      title: "Q",
      description: "",
      quiz: {
        questions: [
          {
            id: "q1",
            prompt: "P?",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
            correctOptionId: "a",
          },
        ],
      },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "quiz") {
      expect(r.data.quiz.questions[0].timeLimitSec).toBe(30);
      expect(r.data.quiz.questions[0].points).toBe(100);
    }
  });

  it("accepts a valid wordcloud", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "wordcloud",
      title: "W",
      description: "",
      wordcloud: { prompt: "Say a word" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid bingo with 16 terms", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "bingo",
      title: "B",
      description: "",
      bingo: {
        terms: Array.from({ length: 16 }, (_, i) => `t-${i}`),
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects payload without a discriminator", () => {
    const r = minigameTemplateSchema.safeParse({
      title: "X",
      description: "",
      poll: { question: "?", options: [{ id: "a", label: "A" }] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (.strict)", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "poll",
      title: "X",
      description: "",
      poll: {
        question: "?",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
      extra: "leak",
    });
    expect(r.success).toBe(false);
  });

  it("rejects poll with only one option", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "poll",
      title: "X",
      description: "",
      poll: {
        question: "?",
        options: [{ id: "a", label: "A" }],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects bingo with fewer than 16 terms", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "bingo",
      title: "X",
      description: "",
      bingo: { terms: ["only-one"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty title", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "poll",
      title: "",
      description: "",
      poll: {
        question: "?",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects quiz with empty questions array", () => {
    const r = minigameTemplateSchema.safeParse({
      type: "quiz",
      title: "Q",
      description: "",
      quiz: { questions: [] },
    });
    expect(r.success).toBe(false);
  });
});
