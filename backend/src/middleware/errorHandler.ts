import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let errorMessage = "Internal server error";

  if (err instanceof Error) {
    errorMessage = err.message;
    const cause = err.cause;
    if (cause && typeof cause === "object" && "status" in cause) {
      statusCode = (cause as { status: number }).status;
    }
  }

  if (process.env.NODE_ENV !== "production" && statusCode >= 500) {
    console.error(err.stack ?? err);
  }

  res.status(statusCode).json({ ok: false, error: errorMessage });
};
