import { Request, Response, NextFunction } from "express";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateParamId(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName] as string;
    if (id && !SAFE_ID_PATTERN.test(id)) {
      res.status(400).json({ success: false, error: "Invalid ID format" });
      return;
    }
    next();
  };
}

export function safeError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Unknown error";
  // eslint-disable-next-line no-console
  console.error("API Error:", message);
  return "An internal error occurred";
}

export function validateUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
