import { useEffect, useRef, useState } from 'react';
import { createReportClient, type ExecutiveReport } from './reportClient';

const keyFor = (value: ExecutiveReport | null) => value ? `${value.ownerId}/${value.id}` : '';

/** The service caps investigations at twelve versions. Reuse its authorized
 * per-version reads; a future higher ceiling needs a paginated history API. */
export function useReportHistory(report: ExecutiveReport | null, enabled: boolean, client: ReturnType<typeof createReportClient>) {
  const key = keyFor(report), version = report?.selectedVersion ?? 0;
  const latest = useRef(report);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{key: string; answers: ExecutiveReport[]; unavailable: boolean; loading: boolean}>({key:'',answers:[],unavailable:false,loading:false});
  useEffect(() => {
    if (!enabled || !report) {setState({key:'',answers:[],unavailable:false,loading:false});return;}
    let controller: AbortController | null = null;
    let disposed = false;
    const previous = latest.current;
    const versions = report.versions.filter(v => v.version < version);
    setState(current => ({key, answers: [...(current.key===key ? current.answers : []), ...(previous && keyFor(previous)===key && previous.selectedVersion<version ? [previous] : [])]
      .filter((answer,index,all)=>answer.selectedVersion<version && all.findIndex(item=>item.selectedVersion===answer.selectedVersion)===index), unavailable:false,loading:versions.length>0}));
    async function refresh() {
      if (document.visibilityState==='hidden' || controller) return;
      const current = new AbortController();controller=current;
      const results = await Promise.allSettled(versions.map(v=>client.get(report!,v.version,AbortSignal.any([current.signal,AbortSignal.timeout(15_000)]))));
      if (!disposed && !current.signal.aborted) setState({key,answers:results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]),unavailable:results.some(result=>result.status==='rejected'),loading:false});
      if(controller===current) controller=null;
    }
    const visibility = () => {
      if(document.visibilityState==='hidden') {controller?.abort();controller=null;setState({key,answers:[],unavailable:false,loading:false});}
      else void refresh();
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30_000);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{disposed=true;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  }, [client,enabled,key,version,retry]);
  useEffect(()=>{latest.current=report;},[report]);
  return {...(enabled && state.key===key ? state : {answers:[],unavailable:false,loading:false}), retry:()=>setRetry(value=>value+1)};
}
