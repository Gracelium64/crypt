import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api";

export default function useProviders() {
  const [providerStatuses, setProviderStatuses] = useState<any[]>([]);

  const loadProviderStatuses = useCallback(async () => {
    try {
      const response = await apiFetch(`/providers/status`);
      if (!response.ok) throw new Error("Could not load provider status");
      const payload = await response.json();
      setProviderStatuses(payload.data ?? []);
    } catch (err) {
      setProviderStatuses([]);
    }
  }, []);

  return { providerStatuses, loadProviderStatuses };
}
