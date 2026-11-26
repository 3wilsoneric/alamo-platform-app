import { useMsal } from '@azure/msal-react';
import { ArrowUp, ArrowDown, History, Pencil, X, Download, RefreshCw, Share2, Square, Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useEveryAgentAccess } from '../../../shared/auth/everyAgentAccess';
import { formatDisplayDate } from '../../../../shared/display-date.mjs';
import { ALAMO_FACILITIES } from '../../../../shared/community-names.mjs';
import { createAgentTransport } from '../conversations/agentTransport';
import { createReportClient, reportRunning, reportStatus, type ExecutiveReport, type ReportScope, type ReportSummary } from './reportClient';
import { reportParticipants } from './reportAccess';
import { useReportHistory } from './useReportHistory';
import { useReportEvents } from './useReportEvents';
import { nextPollDelay, type ReportEvent } from './reportLive';
import ReportProgress from './ReportProgress';
import { isTransientAgentError } from '../conversations/agentErrors';
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
  const canUseGuidance = useEveryAgentAccess();
  const location = useLocation();
  const transport = useMemo(() => createAgentTransport(instance), [instance]);
  const client = useMemo(() => createReportClient(transport), [transport]);
  const [open, setOpen] = useState(false), [reports, setReports] = useState<ReportSummary[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [surface, setSurface] = useState<'chat'|'reports'>('reports');
  const [chatId, setChatId] = useState<string | null>(null);
  const [report, setReport] = useState<ExecutiveReport | null>(null), [draft, setDraft] = useState('');
  const history = useReportHistory(report, open && surface === 'reports', client);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [chartSelection, setChartSelection] = useState<Record<string, ReportMeasures>>({});
  const [documentVersion, setDocumentVersion] = useState<number | null>(null);
  const reportKey = (value: ExecutiveReport) => `${value.ownerId}/${value.id}/${value.selectedVersion}`;
  const measuresFor = (value: ExecutiveReport) => chartSelection[reportKey(value)] ?? {};
  const changeMeasure = (value: ExecutiveReport, section: string, measure: string) => setChartSelection(current => ({...current, [reportKey(value)]: {...current[reportKey(value)], [section]: measure}}));
  const [scope, setScope] = useState(() => initialScope(location.search));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [accessUncertain, setAccessUncertain] = useState(false);
  // Non-destructive notices: a transient outage never clears what is shown.
  const [reconnecting, setReconnecting] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false), [pollNudge, setPollNudge] = useState(0);
  const handledNudge = useRef(0), listFailures = useRef(0);
  const [share, setShare] = useState(false), [retryList, setRetryList] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const historyMenu = useRef<HTMLDetailsElement>(null), body = useRef<HTMLDivElement>(null), latestTurn = useRef<HTMLDivElement>(null);
  const documentHeading = useRef<HTMLHeadingElement>(null), documentOpener = useRef<HTMLElement | null>(null);
  const [documentSource,setDocumentSource] = useState<string | null>(null);
  const revealLatest = useRef(false);
  const wasOpen = useRef(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0), running = useRef(false);
  const retryCommand = useRef<{key: string; id: string} | null>(null);
  const linkedReport = new URLSearchParams(location.search).get('allyReport');
  const linkedVersion = new URLSearchParams(location.search).get('allyVersion');
  useEffect(() => {
    if (!linkedReport || !/^[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(linkedReport)) return;
    const [ownerId,id] = linkedReport.split('/');
    if (linkedVersion !== null && !/^(?:[1-9]|1[0-2])$/.test(linkedVersion)) return;
    if (ownerId && id) { setOpen(true); setSurface('reports'); void openReport({ownerId,id},linkedVersion ? Number(linkedVersion) : undefined); }
  }, [linkedReport,linkedVersion]);
  function commandId(key: string) {
    if (retryCommand.current?.key !== key) retryCommand.current = {key, id: crypto.randomUUID()};
    return retryCommand.current!.id;
  }
  useEffect(() => () => { request.current?.abort(); ++generation.current; running.current = false; }, []);
  const documentOpen = documentVersion !== null;
  useEffect(() => {
    if (!documentOpen) return;
    const source = documentSource ? document.getElementById(`ally-document-${documentSource}`) : null;
    if (source) { const details=source.closest('details'); if(details) details.open=true; source.scrollIntoView({block:'start'}); source.focus({preventScroll:true}); }
    else documentHeading.current?.focus({preventScroll:true});
  }, [documentOpen,documentVersion,documentSource]);
  useEffect(() => {
    const closeHistory = (event: PointerEvent) => { if (event.target instanceof Node && !historyMenu.current?.contains(event.target)) historyMenu.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown',closeHistory);
    return () => document.removeEventListener('pointerdown',closeHistory);
  }, []);
  function closeDocument() {
    const opener = documentOpener.current;
    setDocumentVersion(null);
    requestAnimationFrame(() => {
      // The reader's removal leaves focus on body. Do not steal it back if the
      // user has already clicked the composer or another control in this frame.
      if (document.activeElement === document.body) opener?.focus({preventScroll:true});
    });
  }
  function scrollToLatest(animate = false) {
    const container = body.current, turn = latestTurn.current;
    if (!container || !turn) return;
    container.scrollTo({top: Math.max(0, container.scrollTop + turn.getBoundingClientRect().top - container.getBoundingClientRect().top - 20),
      behavior: animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'});
    setAwayFromLatest(false);
  }
  useEffect(() => {
    if (revealLatest.current && (pendingQuestion || report && !history.loading)) {
      revealLatest.current = false;
      requestAnimationFrame(() => scrollToLatest());
    }
  }, [report?.id, report?.selectedVersion, pendingQuestion, history.loading]);
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
    const toggleFromHeader = () => { if (!open) setSurface('reports'); changeOpen(!open); };
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
    let retry: number | undefined;
    client.list(controller.signal).then(v => { if (!controller.signal.aborted) { listFailures.current = 0; setReports(v.reports); setReconnecting(null); } }).catch(e => {
      if (controller.signal.aborted) return;
      if (isTransientAgentError(e)) { setReconnecting(e.message); retry = window.setTimeout(() => setRetryList(v => v+1), nextPollDelay(false, ++listFailures.current)); }
      else { setReports([]); setError(e.message); }
    });
    return () => { controller.abort(); clearTimeout(retry); };
  }, [open, surface, client, retryList]);
  const onReportEvent = useCallback((event: ReportEvent) => {
    const patch = event.report;
    // Terminal states wait for the full GET so "Ready" never shows without its answer.
    if (patch && (!patch.status || reportRunning(patch.status))) setReport(current => current && current.id === (patch.id ?? current.id) && current.ownerId === (patch.ownerId ?? current.ownerId) && current.selectedVersion === current.version
      ? {...current, ...patch, id: current.id, ownerId: current.ownerId, version: current.version} : current);
    if (event.type === 'done' || (patch?.status && !reportRunning(patch.status))) setPollNudge(value => value + 1);
  }, []);
  const events = useReportEvents(report, open && surface === 'reports' && !busy, transport, onReportEvent);
  useEffect(() => {
    if (!open || surface !== 'reports' || !report || busy) return;
    const controller = new AbortController(), current = generation.current, isRunning = reportRunning(report.status);
    let polling = false, failures = 0, timer: number | undefined;
    // While the event stream is live, polling only rechecks access.
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(() => void poll(), events.live && failures === 0 ? 30_000 : nextPollDelay(isRunning, failures)); };
    const poll = async () => {
      if (controller.signal.aborted || polling) return;
      if (document.visibilityState === 'hidden') { schedule(); return; }
      polling = true;
      try {
        const next = await client.get(report, report.selectedVersion === report.version ? undefined : report.selectedVersion, controller.signal);
        if (!controller.signal.aborted && current === generation.current) { failures = 0; setReport(next); setAccessUncertain(false); setError(null); setReconnecting(null); }
      }
      catch (e) {
        if (controller.signal.aborted || current !== generation.current) return;
        // Keep the last good report, list and sharing state through outages.
        if (isTransientAgentError(e)) { failures++; setReconnecting(e.message); }
        else { setReport(null); setDocumentVersion(null); setReports([]); setShare(false); setReconnecting(null); setError(e instanceof Error ? e.message : 'Report access could not be verified.'); }
      }
      finally { polling = false; if (!controller.signal.aborted) schedule(); }
    };
    // Recheck saved content too, so a revoked share disappears without reload.
    if (pollNudge !== handledNudge.current) { handledNudge.current = pollNudge; void poll(); } else schedule();
    document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', poll); };
  }, [open, surface, client, report?.id, report?.status, report?.version, report?.selectedVersion, busy, events.live, pollNudge]);
  useEffect(() => { setStopping(false); }, [report?.id, report?.version]);
  async function perform(operation: (signal: AbortSignal) => Promise<ExecutiveReport>) {
    if (running.current) return false;
    running.current = true; setBusy(true); setError(null); setNotice(null);
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const current = ++generation.current;
    try {
      const result = await operation(controller.signal);
      if (!controller.signal.aborted && current === generation.current) { setReport(result); setAccessUncertain(false); setScope(result.scope); setRetryList(v => v+1); retryCommand.current = null; return true; }
    }
    catch (e) { if (!controller.signal.aborted && current === generation.current) {
      if (isTransientAgentError(e)) setNotice(e.message);
      else { setAccessUncertain(true); setDocumentVersion(null); setError(e instanceof Error ? e.message : 'Try again.'); }
    } }
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
    return false;
  }
  async function openReport(value: Pick<ReportSummary, 'id'|'ownerId'>, version?: number) {
    // Navigation replaces an in-flight retrieval; stale results cannot win.
    request.current?.abort(); running.current = false;
    historyMenu.current?.removeAttribute('open');
    revealLatest.current = true;
    setDocumentVersion(null); setReport(null); setDraft(''); setShare(false);
    const loaded = await perform(signal => client.get(value, version, signal));
    if (loaded && dialog.current?.open) input.current?.focus({preventScroll:true});
  }
  async function command(action: string, extra: Record<string, unknown> = {}) {
    if (!report) return false;
    return perform(async signal => { const next = await client.command(report, action, extra, signal); return client.get(next, undefined, signal); });
  }
  async function stop() {
    // Show the request immediately; the follow-up GET confirms "Stopped".
    setStopping(true);
    if (!await command('cancel')) setStopping(false);
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); const text = draft.trim(); if (!text || busy || report && reportRunning(report.status)) return;
    const key = JSON.stringify([report?.id, text, scope]);
    revealLatest.current = true; setPendingQuestion(text);
    const sent = await perform(async signal => {
      const next = report ? await client.command(report, 'followup', {objective: text, scope, requestId: commandId(key)}, signal) : await client.create(text, scope, commandId(key), signal);
      return client.get(next, undefined, signal);
    });
    if (sent) setDraft('');
    setPendingQuestion(null);
  }
  function startNew() { if (busy) return; ++generation.current; historyMenu.current?.removeAttribute('open'); setDocumentVersion(null); setChartSelection({}); setReport(null); setPendingQuestion(null); setError(null); setNotice(null); setReconnecting(null); setShare(false); setDraft(''); setScope(initialScope(location.search)); input.current?.focus(); }
  function openBlankReport() { startNew(); setChatId(null); setSurface('reports'); requestAnimationFrame(()=>input.current?.focus()); }
  async function exportReport(value = report) {
    if (!value || busy) return;
    // Open synchronously for popup blockers, then reauthorize the selected version.
    const target = window.open('', '_blank'); if (!target) { setError('Allow a new window to export this report.'); return; }
    target.opener = null; target.document.title = 'Preparing report';
    try {
      const fresh = await client.get(value, value.selectedVersion);
      const {printReport} = await import('./printReport'); await printReport(target, fresh, measuresFor(value));
    } catch (e) {
      target.close();
      if (isTransientAgentError(e)) setNotice(e.message);
      else { setReport(null); setDocumentVersion(null); setError(e instanceof Error ? e.message : 'Report export unavailable.'); }
    }
  }
  const editable = report?.canEdit && report.selectedVersion === report.version;
  const active = report && reportRunning(report.status);
  const answers = report && !accessUncertain && !error ? [...history.answers, report] : [];
  // A refresh replaces the presentation of the same question. Every saved
  // version remains available in the report reader.
  const threadAnswers = answers.filter((value,index) => {const next=answers[index+1];return !next || !next.artifact || next.objective!==value.objective || JSON.stringify(next.scope)!==JSON.stringify(value.scope);});
  const documentReport = answers.find(value => value.selectedVersion === documentVersion);
  useEffect(() => {
    if (documentVersion !== null && !documentReport && !history.loading) {
      setDocumentVersion(null);
      input.current?.focus({preventScroll:true});
    }
  }, [documentVersion, documentReport, history.loading]);
  const reportActions = report && (report.artifact || (editable && !active)) && <details className="ally-report-actions"><summary aria-label="More report actions" title="More report actions"><MoreHorizontal size={21}/></summary><div role="group" aria-label="Report actions">
    {report.artifact && <button type="button" disabled={busy} onClick={e => {e.currentTarget.closest('details')!.open=false; void exportReport();}}><Download size={17}/>Save PDF</button>}
    {editable && !active && <button type="button" disabled={busy} onClick={e => {e.currentTarget.closest('details')!.open=false; void command('refresh',{requestId:commandId(`refresh:${report.id}:${report.version}`)});}}><RefreshCw size={17}/>Refresh report</button>}
    {editable && !active && report.artifact && <button type="button" aria-expanded={share} onClick={e => {e.currentTarget.closest('details')!.open=false; setShare(!share);}}><Share2 size={17}/>Share report</button>}
  </div></details>;
  const allCommunities = scope.communityIds.length === 0 || ALAMO_FACILITIES.every(f => scope.communityIds.includes(f.facilityId));
  const scopeLabel = allCommunities ? 'All communities' : scope.communityIds.map(id => ALAMO_FACILITIES.find(f => f.facilityId === id)?.shortName ?? id).join(', ');
  const scopeChoice = allCommunities ? '' : scope.communityIds.length === 1 ? scope.communityIds[0] : 'selected';
  const reportSurface = <div className={`executive-ally-report-surface ally-conversation${documentReport ? ' ally-conversation--document' : ''}`}>
    <div className="ally-conversation-column">
      <div ref={body} className="executive-ally-body" onWheel={() => {revealLatest.current=false;}} onPointerDown={() => {revealLatest.current=false;}} onScroll={() => {if(body.current && latestTurn.current) setAwayFromLatest(latestTurn.current.getBoundingClientRect().top > body.current.getBoundingClientRect().bottom - 48);}}>
        {error && <div role="alert" className="ally-report-error"><p>{error}</p><button onClick={() => {if(report) void openReport(report); else {setError(null);setRetryList(v=>v+1);}}}>Refresh reports</button><button onClick={() => void transport.connect().then(()=>setRetryList(v=>v+1)).catch(()=>setError('Sign-in was not completed.'))}>Connect sign-in</button></div>}
        {!error && (reconnecting || notice) && <div className="ally-report-notice" role={notice ? 'alert' : 'status'}><p>{notice ?? "Ally is temporarily unavailable. Showing your last update while reconnecting…"}</p>{notice && <button type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={16}/></button>}</div>}
        {!report && !busy && !error && <div className="executive-ally-empty"><h2>Ask Ally</h2></div>}
        <div className="ally-conversation-thread" aria-label="Conversation">
          {history.loading && <p className="ally-history-status" role="status">Loading earlier answers…</p>}
          {history.unavailable && <p className="ally-history-status" role="status">Some earlier answers are unavailable. <button type="button" onClick={history.retry}>Retry</button></p>}
          {threadAnswers.map(value => <div className="ally-thread-turn" data-version={value.selectedVersion} data-working={reportRunning(value.status)} key={reportKey(value)} ref={value === report && !pendingQuestion ? latestTurn : undefined}>
            <div className="ally-thread-question"><span className="sr-only">You: </span>{value.objective}</div>
            <div className="ally-thread-answer"><span className="sr-only">Ally: </span>
              {reportRunning(value.status) && <ReportProgress report={value} liveSteps={value === report ? events.steps : []} stopping={value === report && stopping}/>}
              {value.error && <p role="status">{value.error}</p>}
              {['paused','failed','cancelled'].includes(value.status) && <div className="ally-thread-progress" role="status">{reportStatus(value.status)}{value === report && editable && value.status !== 'cancelled' && <button disabled={busy} onClick={() => void command('resume')}>Resume</button>}</div>}
              <ReportView report={value} canvas anchorPrefix={`ally-turn-${value.selectedVersion}`} measures={measuresFor(value)} onMeasureChange={(section,measure) => changeMeasure(value,section,measure)} onOpenSource={(section,opener)=>{documentOpener.current=opener;setDocumentSource(section);setExpanded(true);setDocumentVersion(value.selectedVersion);}}/>
              {value.artifact && <footer className="ally-thread-actions"><button type="button" onClick={e => {documentOpener.current=e.currentTarget;setDocumentSource(null);setExpanded(true);setDocumentVersion(value.selectedVersion);}}>Open report</button>{value === report && reportActions}</footer>}
            </div>
          </div>)}
          {pendingQuestion && <div className="ally-thread-turn" ref={latestTurn}><div className="ally-thread-question"><span className="sr-only">You: </span>{pendingQuestion}</div><div className="ally-thread-progress" role="status"><span className="ally-working-dot" aria-hidden="true"/>Sending…</div></div>}
        </div>
        {share && report && !error && <fieldset className="ally-report-sharing"><legend>Report access</legend>{reportParticipants().filter(p=>p.id!==report.ownerId).map(p => <label key={p.id}><input type="checkbox" checked={report.readers.includes(p.id)} disabled={busy} onChange={e => void command(e.target.checked ? 'share' : 'unshare',{readerId:p.id})}/>{p.name}</label>)}<p>Recipients need their own source access.</p><button onClick={() => {const url=new URL(location.pathname,window.location.origin);url.searchParams.set('allyReport',`${report.ownerId}/${report.id}`);void navigator.clipboard.writeText(url.href).catch(()=>setError('The report link could not be copied.'));}}>Copy link</button></fieldset>}
      </div>
      {awayFromLatest && <button className="ally-latest" aria-label="Go to latest answer" onClick={() => scrollToLatest(true)}><ArrowDown size={17}/>Latest</button>}
      <form className="executive-ally-composer" onSubmit={e => void submit(e)}>
        <details className="ally-report-scope"><summary>{scopeLabel} · {formatDisplayDate(scope.from,{month:'short'})} – {formatDisplayDate(scope.through,{month:'short'})}</summary><div><label>Community<select value={scopeChoice} disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,communityIds:e.target.value?[e.target.value]:[]})}><option value="">All communities</option>{scopeChoice === 'selected' && <option value="selected" disabled>{scopeLabel}</option>}{ALAMO_FACILITIES.map(f=><option key={f.facilityId} value={f.facilityId}>{f.shortName}</option>)}</select></label><label>From<input type="date" value={scope.from} max={scope.through} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,from:e.target.value})}/></label><label>Through<input type="date" value={scope.through} min={scope.from} required disabled={busy || Boolean(active)} onChange={e=>setScope({...scope,through:e.target.value})}/></label></div></details>
        <div className="executive-ally-input"><textarea ref={input} aria-label={report ? 'Follow-up question' : 'Ask Ally'} placeholder="Ask Ally…" rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => {if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();if(!active && !busy) e.currentTarget.form?.requestSubmit();}}} disabled={busy || Boolean(report && !editable)}/>{active && editable ? <button type="button" aria-label="Stop" disabled={busy || stopping} onClick={() => void stop()}><Square size={19}/></button> : <button type="submit" aria-label="Send question" disabled={busy || Boolean(active) || Boolean(report && !editable) || !draft.trim()}><ArrowUp size={22}/></button>}</div>
      </form>
    </div>
    {documentReport && <aside className="ally-document-reader" aria-label="Expanded report"><header><h2 ref={documentHeading} tabIndex={-1}>Report</h2>{report && report.versions.length > 1 && <select aria-label="Report version" value={documentVersion!} onChange={e=>{setDocumentSource(null);setDocumentVersion(Number(e.target.value));}}>{report.versions.filter(v=>v.version<=report.selectedVersion).map(v=><option key={v.version} value={v.version}>Version {v.version}</option>)}</select>}<button aria-label="Save PDF" title="Save PDF" disabled={busy} onClick={() => void exportReport(documentReport)}><Download size={19}/></button><button aria-label="Close report" onClick={closeDocument}><X size={20}/></button></header><div className="ally-document-body"><ReportView report={documentReport} anchorPrefix="ally-document" measures={measuresFor(documentReport)} onMeasureChange={(section,measure) => changeMeasure(documentReport,section,measure)}/></div></aside>}
  </div>;
  function escapePanel() {
    if(historyMenu.current?.open) {historyMenu.current.open=false;historyMenu.current.querySelector('summary')?.focus();}
    else if(documentVersion!==null) closeDocument();
    else if(matchMedia('(max-width: 700px)').matches) changeOpen(false);
    else if(expanded) setExpanded(false);
    else changeOpen(false);
  }
  return <div className="executive-ally">
    <dialog ref={dialog} className={`executive-ally-panel${surface==='chat' ? ' executive-ally-panel--chat' : ''}${expanded ? ' executive-ally-panel--expanded' : ''}`} aria-label="Ally" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();escapePanel();}}} onCancel={e=>{e.preventDefault();escapePanel();}}>
      <header className="executive-ally-header"><AllyMark className="ally-panel-mark"/><strong>Ally</strong>
        {(!accessUncertain && reports.length>0 || agentChatConfigured) && <details ref={historyMenu} className="ally-conversation-history"><summary aria-label="Saved conversations" title="History"><History size={19}/><span>History</span></summary><nav aria-label="Saved reports">
          {!accessUncertain && reports.length>0 && <input aria-label="Search conversations" type="search" placeholder="Search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/>}
          {(accessUncertain ? [] : reports).filter(r=>r.title.toLocaleLowerCase().includes(historySearch.toLocaleLowerCase())).map(r=><button type="button" key={`${r.ownerId}/${r.id}`} aria-current={r.id===report?.id && r.ownerId===report.ownerId ? 'page' : undefined} disabled={busy} onClick={()=>{setSurface('reports');void openReport(r);}}>{r.title}</button>)}
          {agentChatConfigured && canUseGuidance && <button type="button" className="ally-guidance-history" onClick={()=>{historyMenu.current?.removeAttribute('open');setSurface('chat');}}>Guidance chats</button>}
        </nav></details>}
        <button type="button" className="ally-panel-new" aria-label="New chat" disabled={busy} onClick={openBlankReport}><Pencil size={18}/><span>New chat</span></button>
        <button className="ally-panel-expand" type="button" aria-label={expanded ? 'Restore Ally panel' : 'Expand Ally to full screen'} aria-pressed={expanded} title={expanded ? 'Restore panel' : 'Full screen'} onClick={()=>{if(expanded && documentVersion!==null) closeDocument();setExpanded(value=>!value);}}>{expanded ? <Minimize2 size={18} aria-hidden="true"/> : <Maximize2 size={18} aria-hidden="true"/>}</button>
        <button aria-label="Close Ally" autoFocus onClick={()=>changeOpen(false)}><X size={20}/></button>
      </header>
      {surface==='chat' ? <div className="executive-ally-chat"><AgentConversationHome transport={transport} conversationId={chatId} onNavigate={setChatId} expanded={expanded}/></div> : reportSurface}
    </dialog>
  </div>;
}
