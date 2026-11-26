import { useEffect, useRef, useState } from 'react';
import { isTransientAgentError } from '../conversations/agentErrors';
import { createReportClient, type ExecutiveReport } from './reportClient';
import { applyHistoryResults, cacheableAnswer, versionsToFetch, type HistoryResult } from './reportLive';

const keyFor = (value: ExecutiveReport | null) => value ? `${value.ownerId}/${value.id}` : '';

/** The service caps investigations at twelve versions. Reuse its authorized
 * per-version reads; a future higher ceiling needs a paginated history API.
 *
 * Completed versions are immutable: each is fetched once and cached by
 * (report, version). The 30 s timer only retries versions that are missing or
 * still running. Access is rechecked for every cached version when the tab
 * becomes visible again or the user presses Retry; an access denial removes
 * that answer, a transient failure keeps the last good copy. Hiding the tab
 * never blanks the conversation. */
export function useReportHistory(report: ExecutiveReport | null, enabled: boolean, client: ReturnType<typeof createReportClient>) {
  const key = keyFor(report), version = report?.selectedVersion ?? 0;
  const latest = useRef(report);
  const cache = useRef<{key: string; versions: Map<number, ExecutiveReport>}>({key: '', versions: new Map()});
  const [retry, setRetry] = useState(0);
  const handledRetry = useRef(0);
  const [state, setState] = useState<{key: string; answers: ExecutiveReport[]; unavailable: boolean; loading: boolean}>({key:'',answers:[],unavailable:false,loading:false});
  useEffect(() => {
    if (!enabled || !report) {setState({key:'',answers:[],unavailable:false,loading:false});return;}
    if (cache.current.key !== key) cache.current = {key, versions: new Map()};
    const store = cache.current.versions;
    let controller: AbortController | null = null;
    let disposed = false;
    const previous = latest.current;
    if (previous && keyFor(previous) === key && previous.selectedVersion < version && cacheableAnswer(previous)) store.set(previous.selectedVersion, previous);
    const versions = report.versions.filter(v => v.version < version);
    const answers = () => versions.flatMap(v => store.get(v.version) ?? []);
    setState(current => ({key, answers: answers(), unavailable: current.key === key && current.unavailable, loading: versions.some(v => !store.has(v.version))}));
    async function refresh(revalidate: boolean) {
      if (document.visibilityState === 'hidden' || controller) return;
      const wanted = versionsToFetch(versions, new Set(store.keys()), revalidate);
      if (!wanted.length) { if (!disposed) setState({key, answers: answers(), unavailable: false, loading: false}); return; }
      const current = new AbortController(); controller = current;
      const settled = await Promise.allSettled(wanted.map(n => client.get(report!, n, AbortSignal.any([current.signal, AbortSignal.timeout(15_000)]))));
      if (controller === current) controller = null;
      if (disposed || current.signal.aborted) return;
      const results = settled.map((result, index): HistoryResult => result.status === 'fulfilled'
        ? {version: wanted[index]!, ok: true, value: result.value}
        : {version: wanted[index]!, ok: false, transient: isTransientAgentError(result.reason) || (result.reason instanceof DOMException && result.reason.name === 'TimeoutError')});
      const {unavailable} = applyHistoryResults(store, results);
      setState({key, answers: answers(), unavailable, loading: false});
    }
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const revalidate = retry !== handledRetry.current; handledRetry.current = retry;
    void refresh(revalidate);
    const timer = window.setInterval(() => void refresh(false), 30_000);
    document.addEventListener('visibilitychange', visibility);
    return () => {disposed = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility);};
  }, [client, enabled, key, version, retry]);
  useEffect(() => {latest.current = report;}, [report]);
  return {...(enabled && state.key === key ? state : {answers: [], unavailable: false, loading: Boolean(enabled && report?.versions.some(v => v.version < version))}), retry: () => setRetry(value => value + 1)};
}
