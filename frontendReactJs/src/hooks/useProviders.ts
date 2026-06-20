import { useCallback, useState } from "react";
import { z } from "zod";
import { apiFetch } from "../lib/api";
import type { ProviderStatus } from "../types";
import { ProviderStatusSchema } from "../schemas";

export default function useProviders() {
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

  const loadProviderStatuses = useCallback(async () => {
    try {
      const response = await apiFetch(`/providers/status`);
      if (!response.ok) throw new Error("Could not load provider status");
      const payload = await response.json();
      const parsed = z.array(ProviderStatusSchema).safeParse(payload.data ?? []);
      if (parsed.success) setProviderStatuses(parsed.data);
      else console.error("[Providers] response shape mismatch:", parsed.error);
    } catch (err) {
      console.error("[Providers] loadProviderStatuses failed:", err);
      setProviderStatuses([]);
    }
  }, []);

  return { providerStatuses, loadProviderStatuses };
}
