import { Request, Response, NextFunction } from "express";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

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
  if (err instanceof Error) {
    // Strip URLs and paths from log to avoid leaking repo structure
    const sanitized = err.message.replace(/https?:\/\/[^\s]+/g, "[URL]");
    // eslint-disable-next-line no-console
    console.error("API Error:", sanitized);
  }
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

// Google Maps embed URLs are rendered as iframe src on the public site,
// so we restrict them to the known-safe origin to rule out data: / javascript:
// and open-redirect-like embeds on attacker-controlled origins.
const ALLOWED_MAP_EMBED_HOSTS = new Set(["www.google.com", "maps.google.com"]);

export function validateMapEmbedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!ALLOWED_MAP_EMBED_HOSTS.has(parsed.hostname)) return false;
    return parsed.pathname.startsWith("/maps/");
  } catch {
    return false;
  }
}
