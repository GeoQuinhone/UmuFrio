import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { apiRequest } from "../api.js";

export function useApiCrud(resourcePath, options = {}) {
  const { enabled = true } = options;
  const { user } = useAuth();
  const scope = user?.id ?? user?.email ?? null;
  const requestId = useRef(0);

  const [result, setResult] = useState({
    scope,
    items: [],
    loading: enabled,
    error: null,
  });

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!enabled) {
      setResult({ scope, items: [], loading: false, error: null });
      return;
    }

    setResult((previous) => ({
      scope,
      items: previous.scope === scope ? previous.items : [],
      loading: true,
      error: null,
    }));

    try {
      const data = await apiRequest(resourcePath);
      if (currentRequest === requestId.current) {
        setResult({
          scope,
          items: Array.isArray(data) ? data : [],
          loading: false,
          error: null,
        });
      }
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setResult({
          scope,
          items: [],
          loading: false,
          error: requestError.message,
        });
      }
    }
  }, [resourcePath, enabled, scope]);

  useEffect(() => {
    reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  const add = useCallback(
    async (payload) => {
      const created = await apiRequest(resourcePath, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await reload();
      return created;
    },
    [resourcePath, reload],
  );

  const action = useCallback(
    async (id, subPath, payload) => {
      const result = await apiRequest(`${resourcePath}/${id}${subPath}`, {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });

      await reload();
      return result;
    },
    [resourcePath, reload],
  );

  const update = useCallback(
    async (id, payload) => {
      const result = await apiRequest(`${resourcePath}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      await reload();
      return result;
    },
    [resourcePath, reload],
  );

  const remove = useCallback(
    async (id) => {
      await apiRequest(`${resourcePath}/${id}`, {
        method: "DELETE",
      });

      await reload();
    },
    [resourcePath, reload],
  );

  const visibleResult =
    enabled && result.scope === scope
      ? result
      : { items: [], loading: enabled, error: null };

  return {
    items: visibleResult.items,
    loading: visibleResult.loading,
    error: visibleResult.error,
    add,
    update,
    remove,
    action,
    reload,
  };
}