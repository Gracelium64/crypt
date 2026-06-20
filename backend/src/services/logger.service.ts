import { Log } from "#models";

type LogLevel = "info" | "warn" | "error";

export const logEvent = async (
  level: LogLevel,
  event: string,
  context?: Record<string, unknown> | null,
  error?: unknown,
) => {
  try {
    const doc: {
      level: LogLevel;
      event: string;
      context?: Record<string, unknown> | null;
      accountId?: string | null;
      errorMessage?: string | null;
      errorStack?: string | null;
    } = { level, event, context: context ?? null };

    if (context?.accountId && typeof context.accountId === "string") {
      doc.accountId = context.accountId;
    }

    if (error instanceof Error) {
      doc.errorMessage = error.message;
      doc.errorStack = error.stack ?? null;
    } else if (error != null) {
      doc.errorMessage = String(error);
    }

    await Log.create(doc);
  } catch {
    // logger must never throw
  }
};
