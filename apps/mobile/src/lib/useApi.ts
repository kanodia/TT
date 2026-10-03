import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, qs } from './api';

type Query = Parameters<typeof qs>[0];
type State<T> = { key: string; data?: T; error?: string };

/**
 * GET a JSON endpoint and keep it in state. Pass `null` as the path to skip (e.g. until signed in).
 * Loading is derived from the request key, so a change of path or query shows loading straight away.
 */
export function useApi<T>(path: string | null, query?: Query) {
  const key = path ? `${path}${qs(query)}` : '';
  const [state, setState] = useState<State<T>>({ key: '' });
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path, { query })
      .then((data) => live && setState({ key, data }))
      .catch((e) => live && setState({ key, error: errorMessage(e) }))
      .finally(() => live && setRefreshing(false));
    return () => {
      live = false;
    };
    // `key` captures path + query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const current = state.key === key;
  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({ ...s, data: typeof update === 'function' ? (update as (p: T | undefined) => T)(s.data) : update }));
  }, []);

  return {
    data: current ? state.data : undefined,
    /** Last good data, kept while a new query loads so lists don't blank out. */
    stale: state.data,
    error: current ? state.error : undefined,
    loading: !!path && !current,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    /** Pull-to-refresh: keeps the current data on screen while reloading. */
    refreshing,
    refresh: useCallback(() => {
      setRefreshing(true);
      setNonce((n) => n + 1);
    }, []),
    setData,
  };
}
