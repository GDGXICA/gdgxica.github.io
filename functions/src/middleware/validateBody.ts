import { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Strict body validation middleware. Replaces req.body with the parsed
// (and stripped) value, so handlers see only allow-listed fields and
// callers cannot smuggle extras (`__proto__`, arbitrary keys) into the
// JSON we commit to the data repo.
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.slice(0, 5).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
