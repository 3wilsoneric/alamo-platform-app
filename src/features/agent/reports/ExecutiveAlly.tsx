import { useMsal } from '@azure/msal-react';
import { ArrowUp, BookmarkCheck, Plus, Pencil, X, Download, RefreshCw, Share2, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { ALAMO_FACILITIES } from '../../../../shared/community-names.mjs';
import { createAgentTransport } from '../conversations/agentTransport';
import { createReportClient, reportRunning, reportStatus, type ExecutiveReport, type ReportScope, type ReportSummary } from './reportClient';
import { reportParticipants } from './reportAccess';
import ReportView from './ReportView';
import AgentConversationHome from '../conversations/AgentConversationHome';
import { agentChatConfigured } from '../conversations/agentTransport';
import { OPEN_ALLY_EVENT } from '../allyLauncher';
import './executiveAlly.css';

const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
function initialScope(search: string): ReportScope {
  const params = new URLSearchParams(search), community = params.get('community') ?? params.get('facilityId');
  const through = today();
  return {communityIds: ALAMO_FACILITIES.some(f => f.facilityId === community) ? [community!] : [], from: `${through.slice(0,4)}-01-01`, through};
}
export default function ExecutiveAlly() {
  const {instance} = useMsal();
  const location = useLocation();
  const transport = useMemo(() => createAgentTransport(instance), [instance]);
  const client = useMemo(() => createReportClient(transport), [transport]);
  const [open, setOpen] = useState(false), [reports, setReports] = useState<ReportSummary[]>([]);
  const [surface, setSurface] = useState<'chat'|'reports'>(agentChatConfigured ? 'chat' : 'reports');
  const [chatId, setChatId] = useState<string | null>(null);
  const [report, setReport] = useState<ExecutiveReport | null>(null), [draft, setDraft] = useState('');
  const [scope, setScope] = useState(() => initialScope(location.search));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(false), [retryList, setRetryList] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null), generation = useRef(0), running = useRef(false);
  const retryCommand = useRef<{key: string; id: string} | null>(null);
  const linkedReport = new URLSearchParams(location.search).get('allyReport');
  useEffect(() => {
    if (!linkedReport || !/^[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(linkedReport)) return;
    const [ownerId,id] = linkedReport.split('/');
    if (ownerId && id) { setOpen(true); setSurface('reports'); void openReport({ownerId,id}); }
  }, [linkedReport]);
  useEffect(() => {
    const openFromHeader = () => { setSurface(agentChatConfigured ? 'chat' : 'reports'); setOpen(true); };
    window.addEventListener(OPEN_ALLY_EVENT, openFromHeader);
    return () => window.removeEventListener(OPEN_ALLY_EVENT, openFromHeader);
  }, []);
  function commandId(key: string) {
    if (retryCommand.current?.key !== key) retryCommand.current = {key, id: crypto.randomUUID()};
    return retryCommand.current!.id;
  }
  useEffect(() => () => { request.current?.abort(); ++generation.current; running.current = false; }, []);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const resize = () => { if (!open) { if (el.open) el.close(); return; } const mobile = matchMedia('(max-width: 700px)').matches; if (el.open) el.close(); if (mobile) el.showModal(); else el.show(); };
    resize(); window.addEventListener('resize', resize);
    if (!open) document.querySelector<HTMLButtonElement>('.platform-ally-header-button')?.focus({preventScroll: true});
    return () => window.removeEventListener('resize', resize);
  }, [open]);
  useEffect(() => {
    if (!open || surface !== 'reports') return;
    const controller = new AbortController();
    client.list(controller.signal).then(v => { if (!controller.signal.aborted) setReports(v.reports); }).catch(e => { if (!controller.signal.aborted) { setReports([]); setError(e.message); } });
    return () => controller.abort();
  }, [open, surface, client, retryList]);
  useEffect(() => {
    if (!open || surface !== 'reports' || !report || busy) return;
    const controller = new AbortController(), current = generation.current;
    let polling = false;
    const poll = async () => {
      if (document.visibilityState === 'hidden' || polling) return;
      polling = true;
      try { const next = await client.get(report, report.selectedVersion === report.version ? undefined : report.selectedVersion, controller.signal); if (!controller.signal.aborted && current === generation.current) setReport(next); }
      catch (e) { if (!controller.signal.aborted && current === generation.current) { setReport(null); setReports([]); setShare(false); setError(e instanceof Error ? e.message : 'Report access could not be verified.'); } }
      finally { polling = false; }
    };
    // Recheck saved content too, so a revoked share disappears without reload.
    const timer = window.setInterval(() => void poll(), reportRunning(report.status) ? 2500 : 30_000);
    document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [open, surface, client, report?.id, report?.status, report?.version, report?.selectedVersion, busy]);
  async function perform(operation: (signal: AbortSignal) => Promise<ExecutiveReport>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const current = ++generation.current;
    try { const result = await operation(controller.signal); if (!controller.signal.aborted && current === generation.current) { setReport(result); setScope(result.scope); setRetryList(v => v+1); retryCommand.current = null; } }
    catch (e) { if (!controller.signal.aborted && current === generation.current) setError(e instanceof Error ? e.message : 'Try again.'); }
    finally { if (current === generation.current) {
      setBusy(false); running.current = false;
      // Disabling a submit/select during a request can move focus to body.
      // Restore it inside the modeless panel, without stealing an active focus.
      requestAnimationFrame(() => {
        if (dialog.current?.open && document.activeElement === document.body) {
          const target = input.current && !input.current.disabled ? input.current : dialog.current.querySelector<HTMLButtonElement>('[aria-label="Close Ally"]');
          target?.focus({preventScroll:true});
        }
      });
    } }
  }
  async function openReport(value: Pick<ReportSummary, 'id'|'ownerId'>, version?: number) {
    // Navigation replaces an in-flight retrieval; stale results cannot win.
    request.current?.abort(); running.current = false;
    setReport(null); setDraft(''); setShare(false); await perform(signal => client.get(value, version, signal));
  }
  async function command(action: string, extra: Record<string, unknown> = {}) {
    if (!report) return;
    await perform(async signal => { const next = await client.command(report, action, extra, signal); return client.get(next, undefined, signal); });
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); const text = draft.trim(); if (!text || busy) return;
    const key = JSON.stringify([report?.id, text, scope]);
    await perform(async signal => {
      const next = report ? await client.command(report, 'followup', {objective: text, scope, requestId: commandId(key)}, signal) : await client.create(text, scope, commandId(key), signal);
      const result = await client.get(next, undefined, signal); setDraft(''); return result;
    });
  }
  function startNew() { if (busy) return; ++generation.current; setReport(null); setError(null); setShare(false); setDraft(''); setScope(initialScope(location.search)); input.current?.focus(); }
  async function exportReport() {
    if (!report || busy) return;
    // Open synchronously for popup blockers, then reauthorize the selected version.
    const target = window.open('', '_blank'); if (!target) { setError('Allow a new window to export this report.'); return; }
    target.opener = null; target.document.title = 'Preparing report';
    try {
      const fresh = await client.get(report, report.selectedVersion);
      const {printReport} = await import('./printReport'); await printReport(target, fresh);
    } catch (e) { target.close(); setReport(null); setError(e instanceof Error ? e.message : 'Report export unavailable.'); }
  }
  const editable = report?.canEdit && report.selectedVersion === report.version;
  const active = report && reportRunning(report.status);
  return <div className="executive-ally">
    <dialog ref={dialog} className={`executive-ally-panel${surface === 'chat' ? ' executive-ally-panel--chat' : ''}`} aria-label="Ally" onKeyDown={e => {if(e.key==='Escape'){e.preventDefault();setOpen(false);}}} onCancel={e => {e.preventDefault(); setOpen(false);}}>
      <header className="executive-ally-header"><BookmarkCheck className="ally-panel-mark" size={28} aria-hidden="true" /><strong>Ally</strong>{surface === 'chat' ? <button className="ally-panel-new" type="button" onClick={() => setChatId(null)}><Pencil size={17} />New chat</button> : <><button className="ally-panel-new" type="button" onClick={() => setSurface('chat')} disabled={!agentChatConfigured}>Back to chat</button><button title="New report" aria-label="New report" onClick={startNew} disabled={busy}><Plus size={20}/></button></>}<button aria-label="Close Ally" autoFocus onClick={() => setOpen(false)}><X size={20}/></button></header>
      {surface === 'chat' ? <div className="executive-ally-chat"><AgentConversationHome transport={transport} conversationId={chatId} onNavigate={setChatId} onBuildReport={() => setSurface('reports')} /></div> : <>
      <nav className="executive-ally-saved" aria-label="Report navigation"><select aria-label="Saved reports" value={report ? `${report.ownerId}/${report.id}` : ''} disabled={busy} onChange={e => {const r=reports.find(v=>`${v.ownerId}/${v.id}`===e.target.value); if(r) void openReport(r); else startNew();}}><option value="">New investigation</option>{reports.map(r => <option key={`${r.ownerId}/${r.id}`} value={`${r.ownerId}/${r.id}`}>{r.title}</option>)}</select>{report && <select aria-label="Report version" value={report.selectedVersion} disabled={busy} onChange={e => void openReport(report, Number(e.target.value))}>{report.versions.map(v => <option key={v.version} value={v.version}>Version {v.version}</option>)}</select>}</nav>
      <div className="executive-ally-body">
        {error && <div role="alert" className="ally-report-error"><p>{error}</p><button onClick={() => {setError(null); setRetryList(v=>v+1);}}>Refresh reports</button><button onClick={() => void transport.connect().then(()=>setRetryList(v=>v+1)).catch(()=>setError('Sign-in was not completed.'))}>Connect sign-in</button></div>}
        {!report && !busy && <div className="executive-ally-empty"><h2>What would you like to understand?</h2><p>Ask a question, compare communities, or build a report.</p><button onClick={() => {setDraft('Compare admissions, discharges and bed use across the communities. Show the differences and any coverage gaps.'); input.current?.focus();}}>Compare community flow</button><button onClick={() => {setDraft('What is waiting in Pipeline, and what can the available records tell us about it?'); input.current?.focus();}}>Review current referrals</button></div>}
        {report && <div className="ally-report-toolbar"><span role="status">{reportStatus(report.status)}{active && ` · ${report.completedSources}/${report.totalSources || '…'} sources`}</span>
          {editable && active && <button disabled={busy} onClick={() => void command('cancel')}><Square size={16}/>Stop</button>}
          {editable && ['paused','failed'].includes(report.status) && <button disabled={busy} onClick={() => void command('resume')}>Resume</button>}
          {editable && !active && <button aria-label="Refresh report" title="Refresh report" disabled={busy} onClick={() => void command('refresh', {requestId: commandId(`refresh:${report.id}:${report.version}`)})}><RefreshCw size={18}/></button>}
          {report.artifact && <button title="Print or save PDF" aria-label="Print or save PDF" onClick={() => void exportReport()} disabled={busy}><Download size={18}/></button>}
          {editable && report.artifact && <button aria-label="Share report" title="Share report" aria-expanded={share} onClick={() => setShare(!share)}><Share2 size={18}/></button>}
        </div>}
        {report?.error && <p role="status">{report.error}</p>}
        {share && report && <fieldset className="ally-report-sharing"><legend>Report access</legend>{reportParticipants().filter(p=>p.id!==report.ownerId).map(p => <label key={p.id}><input type="checkbox" checked={report.readers.includes(p.id)} disabled={busy} onChange={e => void command(e.target.checked ? 'share' : 'unshare', {readerId:p.id})}/>{p.name}</label>)}<p>Recipients need their own source access.</p><button onClick={() => {const url=new URL(location.pathname,window.location.origin);url.searchParams.set('allyReport',`${report.ownerId}/${report.id}`);void navigator.clipboard.writeText(url.href).catch(()=>setError('The report link could not be copied.'));}}>Copy link</button></fieldset>}
        {report && <ReportView report={report}/>}
        {busy && <p role="status">Saving…</p>}
      </div>
      <form className="executive-ally-composer" onSubmit={e => void submit(e)}>
        <details className="ally-report-scope"><summary>{scope.communityIds.length ? ALAMO_FACILITIES.find(f => f.facilityId === scope.communityIds[0])?.shortName : 'All communities'} · {scope.from} – {scope.through}</summary><div><label>Community<select value={scope.communityIds[0] ?? ''} disabled={busy || Boolean(active)} onChange={e=>setScope({...scope, communityIds:e.target.value?[e.target.value]:[]})}><option value="">All communities</option>{ALAMO_FACILITIES.map(f=><option key={f.facilityId} value={f.facilityId}>{f.shortName}</option>)}</select></label><label>From<input type="date" value={scope.from} max={scope.through} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,from:e.target.value})}/></label><label>Through<input type="date" value={scope.through} min={scope.from} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,through:e.target.value})}/></label></div></details>
        <div className="executive-ally-input"><textarea ref={input} aria-label={report ? 'Follow-up question' : 'Ask Ally'} placeholder={report ? 'Ask a follow-up…' : 'Ask Ally…'} rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy || Boolean(active) || Boolean(report && !editable)}/><button type="submit" aria-label="Send question" disabled={busy || Boolean(active) || Boolean(report && !editable) || !draft.trim()}><ArrowUp size={22}/></button></div>
      </form>
      </>}
    </dialog>
  </div>;
}
