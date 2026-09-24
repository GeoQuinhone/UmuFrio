import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api.js";

export function useApiCrud(resourcePath, options = {}) {
  const { enabled = true } = options;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest(resourcePath);
      setItems(data || []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [resourcePath, enabled]);

  useEffect(() => {
    reload();
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

  return {
    items,
    loading,
    error,
    add,
    update,
    remove,
    action,
    reload,
  };
}