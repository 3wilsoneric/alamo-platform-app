import { useMsal } from '@azure/msal-react';
import { ArrowUp, Plus, Pencil, X, Download, RefreshCw, Share2, Square, Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { ALAMO_FACILITIES } from '../../../../shared/community-names.mjs';
import { createAgentTransport } from '../conversations/agentTransport';
import { createReportClient, reportRunning, reportStatus, type ExecutiveReport, type ReportScope, type ReportSummary } from './reportClient';
import { reportParticipants } from './reportAccess';
import ReportView, { type ReportMeasures } from './ReportView';
import AgentConversationHome from '../conversations/AgentConversationHome';
import { agentChatConfigured } from '../conversations/agentTransport';
import { OPEN_ALLY_EVENT } from '../allyLauncher';
import AllyMark from '../components/AllyMark';
import { useAllyTransition } from '../components/useAllyTransition';
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
  const [expanded, setExpanded] = useState(false);
  const [surface, setSurface] = useState<'chat'|'reports'>(agentChatConfigured ? 'chat' : 'reports');
  const [chatId, setChatId] = useState<string | null>(null);
  const [canvasFocusSignal, setCanvasFocusSignal] = useState(0);
  const [report, setReport] = useState<ExecutiveReport | null>(null), [draft, setDraft] = useState('');
  const [chartSelection, setChartSelection] = useState<{key: string; measures: ReportMeasures}>({key: '', measures: {}});
  const reportKey = report ? `${report.ownerId}/${report.id}/${report.selectedVersion}` : '';
  const measures = chartSelection.key === reportKey ? chartSelection.measures : {};
  const [scope, setScope] = useState(() => initialScope(location.search));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(false), [retryList, setRetryList] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null), newMenu = useRef<HTMLDetailsElement>(null);
  const wasOpen = useRef(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0), running = useRef(false);
  const retryCommand = useRef<{key: string; id: string} | null>(null);
  const linkedReport = new URLSearchParams(location.search).get('allyReport');
  useEffect(() => {
    if (!linkedReport || !/^[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(linkedReport)) return;
    const [ownerId,id] = linkedReport.split('/');
    if (ownerId && id) { setOpen(true); setSurface('reports'); void openReport({ownerId,id}); }
  }, [linkedReport]);
  function commandId(key: string) {
    if (retryCommand.current?.key !== key) retryCommand.current = {key, id: crypto.randomUUID()};
    return retryCommand.current!.id;
  }
  useEffect(() => () => { request.current?.abort(); ++generation.current; running.current = false; }, []);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    let shownAsMobile: boolean | null = null;
    const resize = () => { if (!open) { if (el.open) el.close(); return; } const mobile = matchMedia('(max-width: 700px)').matches; if (el.open && shownAsMobile === mobile) return; if (el.open) el.close(); if (mobile) { el.showModal(); setExpanded(true); } else el.show(); shownAsMobile = mobile; };
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [open]);
  const changeOpen = useAllyTransition(open, setOpen, dialog);
  useEffect(() => {
    const toggleFromHeader = () => { if (!open) setSurface(agentChatConfigured ? 'chat' : 'reports'); changeOpen(!open); };
    window.addEventListener(OPEN_ALLY_EVENT, toggleFromHeader);
    return () => window.removeEventListener(OPEN_ALLY_EVENT, toggleFromHeader);
  }, [changeOpen, open]);
  useEffect(() => {
    if (!open && wasOpen.current) {
      setExpanded(false);
      [...document.querySelectorAll<HTMLButtonElement>('.platform-ally-header-button')].find(button => button.getBoundingClientRect().width > 0)?.focus({preventScroll: true});
    }
    wasOpen.current = open;
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
  function openBlankReport() { newMenu.current?.removeAttribute('open'); startNew(); setSurface('reports'); setCanvasFocusSignal(value => value + 1); }
  async function exportReport() {
    if (!report || busy) return;
    // Open synchronously for popup blockers, then reauthorize the selected version.
    const target = window.open('', '_blank'); if (!target) { setError('Allow a new window to export this report.'); return; }
    target.opener = null; target.document.title = 'Preparing report';
    try {
      const fresh = await client.get(report, report.selectedVersion);
      const {printReport} = await import('./printReport'); await printReport(target, fresh, measures);
    } catch (e) { target.close(); setReport(null); setError(e instanceof Error ? e.message : 'Report export unavailable.'); }
  }
  const editable = report?.canEdit && report.selectedVersion === report.version;
  const active = report && reportRunning(report.status);
  const reportSurface = <div className="executive-ally-report-surface">
      {(!report || reports.length > 1 || report.versions.length > 1) && <nav className="executive-ally-saved" aria-label="Report navigation">{(!report || reports.length > 1) && <select aria-label="Saved reports" value={report ? `${report.ownerId}/${report.id}` : ''} disabled={busy} onChange={e => {const r=reports.find(v=>`${v.ownerId}/${v.id}`===e.target.value); if(r) void openReport(r); else startNew();}}><option value="">Recent reports</option>{reports.map(r => <option key={`${r.ownerId}/${r.id}`} value={`${r.ownerId}/${r.id}`}>{r.title}</option>)}</select>}{report && report.versions.length > 1 && <select aria-label="Report version" value={report.selectedVersion} disabled={busy} onChange={e => void openReport(report, Number(e.target.value))}>{report.versions.map(v => <option key={v.version} value={v.version}>Version {v.version}</option>)}</select>}</nav>}
      <div className="executive-ally-body">
        {error && <div role="alert" className="ally-report-error"><p>{error}</p><button onClick={() => {setError(null); setRetryList(v=>v+1);}}>Refresh reports</button><button onClick={() => void transport.connect().then(()=>setRetryList(v=>v+1)).catch(()=>setError('Sign-in was not completed.'))}>Connect sign-in</button></div>}
        {!report && !busy && <div className="executive-ally-empty"><h2>Ask Ally</h2><p>Describe the question or report you need.</p></div>}
        {report && <div className="ally-report-toolbar"><span role="status">{reportStatus(report.status)}{active && ` · ${report.completedSources}/${report.totalSources || '…'} sources`}</span>
          {editable && active && <button disabled={busy} onClick={() => void command('cancel')}><Square size={16}/>Stop</button>}
          {editable && ['paused','failed'].includes(report.status) && <button disabled={busy} onClick={() => void command('resume')}>Resume</button>}
          {(report.artifact || (editable && !active)) && <details className="ally-report-actions"><summary aria-label="More report actions" title="More report actions"><MoreHorizontal size={21}/></summary><div role="group" aria-label="Report actions">{report.artifact && <button type="button" disabled={busy} onClick={e => { e.currentTarget.closest('details')!.open = false; void exportReport(); }}><Download size={17}/>Save PDF</button>}{editable && !active && <button type="button" disabled={busy} onClick={e => { e.currentTarget.closest('details')!.open = false; void command('refresh', {requestId: commandId(`refresh:${report.id}:${report.version}`)}); }}><RefreshCw size={17}/>Refresh report</button>}{editable && !active && report.artifact && <button type="button" aria-expanded={share} onClick={e => { e.currentTarget.closest('details')!.open = false; setShare(!share); }}><Share2 size={17}/>Share report</button>}</div></details>}
        </div>}
        {report?.error && <p role="status">{report.error}</p>}
        {share && report && <fieldset className="ally-report-sharing"><legend>Report access</legend>{reportParticipants().filter(p=>p.id!==report.ownerId).map(p => <label key={p.id}><input type="checkbox" checked={report.readers.includes(p.id)} disabled={busy} onChange={e => void command(e.target.checked ? 'share' : 'unshare', {readerId:p.id})}/>{p.name}</label>)}<p>Recipients need their own source access.</p><button onClick={() => {const url=new URL(location.pathname,window.location.origin);url.searchParams.set('allyReport',`${report.ownerId}/${report.id}`);void navigator.clipboard.writeText(url.href).catch(()=>setError('The report link could not be copied.'));}}>Copy link</button></fieldset>}
        {report && <ReportView report={report} canvas={expanded} measures={measures} onMeasureChange={(sectionId, measure) => setChartSelection(current => ({key: reportKey, measures: {...(current.key === reportKey ? current.measures : {}), [sectionId]: measure}}))}/>}
        {busy && <p role="status">Saving…</p>}
      </div>
      <form className="executive-ally-composer" onSubmit={e => void submit(e)}>
        <details className="ally-report-scope"><summary>{scope.communityIds.length ? ALAMO_FACILITIES.find(f => f.facilityId === scope.communityIds[0])?.shortName : 'All communities'} · {scope.from} – {scope.through}</summary><div><label>Community<select value={scope.communityIds[0] ?? ''} disabled={busy || Boolean(active)} onChange={e=>setScope({...scope, communityIds:e.target.value?[e.target.value]:[]})}><option value="">All communities</option>{ALAMO_FACILITIES.map(f=><option key={f.facilityId} value={f.facilityId}>{f.shortName}</option>)}</select></label><label>From<input type="date" value={scope.from} max={scope.through} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,from:e.target.value})}/></label><label>Through<input type="date" value={scope.through} min={scope.from} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,through:e.target.value})}/></label></div></details>
        <div className="executive-ally-input"><textarea ref={input} aria-label={report ? 'Follow-up question' : 'Ask Ally'} placeholder={report ? 'Ask a follow-up…' : 'Ask Ally…'} rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy || Boolean(active) || Boolean(report && !editable)}/><button type="submit" aria-label="Send question" disabled={busy || Boolean(active) || Boolean(report && !editable) || !draft.trim()}><ArrowUp size={22}/></button></div>
      </form>
  </div>;
  return <div className="executive-ally">
    <dialog ref={dialog} className={`executive-ally-panel${surface === 'chat' ? ' executive-ally-panel--chat' : ''}${expanded ? ' executive-ally-panel--expanded' : ''}`} aria-label="Ally" onKeyDown={e => {if(e.key==='Escape'){e.preventDefault(); if (newMenu.current?.open) newMenu.current.open = false; else if (matchMedia('(max-width: 700px)').matches) changeOpen(false); else if (expanded) setExpanded(false); else changeOpen(false);}}} onCancel={e => {e.preventDefault(); if (matchMedia('(max-width: 700px)').matches) changeOpen(false); else if (expanded) setExpanded(false); else changeOpen(false);}}>
      <header className="executive-ally-header"><AllyMark className="ally-panel-mark" /><strong>Ally</strong>{surface === 'chat' && !chatId ? <button type="button" className="ally-panel-report" disabled={busy} onClick={openBlankReport}>Report</button> : <details ref={newMenu} className="ally-panel-create"><summary><Plus size={18} aria-hidden="true" />New</summary><div role="group" aria-label="Start new work">{agentChatConfigured && <button type="button" onClick={() => { newMenu.current?.removeAttribute('open'); setChatId(null); setSurface('chat'); }}><Pencil size={17} aria-hidden="true" />New chat</button>}<button type="button" aria-label="New report" disabled={busy} onClick={openBlankReport}><Plus size={17} aria-hidden="true" />New report</button></div></details>}<button className="ally-panel-expand" type="button" aria-label={expanded ? 'Restore Ally panel' : 'Expand Ally to full screen'} aria-pressed={expanded} title={expanded ? 'Restore panel' : 'Full screen'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}</button><button aria-label="Close Ally" autoFocus onClick={() => changeOpen(false)}><X size={20}/></button></header>
      {surface === 'chat' || (expanded && agentChatConfigured) ? <div className="executive-ally-chat"><AgentConversationHome transport={transport} conversationId={chatId} onNavigate={setChatId} expanded={expanded} workspaceCanvas={expanded && surface === 'reports' ? reportSurface : undefined} canvasFocusSignal={canvasFocusSignal} /></div> : reportSurface}
    </dialog>
  </div>;
}
