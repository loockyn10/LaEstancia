import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "./errors";

export type QueryState<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Carga asíncrona con estados de loading/error uniformes. Ignora respuestas obsoletas cuando cambian
 * las dependencias y nunca actualiza estado después de desmontar.
 */
export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[], errorFallback?: string): QueryState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableLoad = useCallback(load, deps);

  const reload = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await stableLoad();
      if (current === version.current) setData(result);
    } catch (failure) {
      if (current === version.current) setError(describeError(failure, errorFallback));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [stableLoad, errorFallback]);

  useEffect(() => {
    void reload();
    return () => {
      version.current += 1;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
