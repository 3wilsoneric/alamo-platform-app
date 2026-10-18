import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { WORKFLOW_KNOWLEDGE_PATH, validateKnowledgeResponse, type KnowledgeResponse } from "@alamo/agent-workflow-knowledge/contracts";
import { fetchWithApiAuth, readBoundedJsonResponse } from "../../../shared/api/authenticatedFetch";

export default function WorkflowKnowledge({ active, onOpenSource }: { active: boolean; onOpenSource: () => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<KnowledgeResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(() => { if (!active) { current.current?.abort(); setResult(null); setError(""); setBusy(false); } return () => current.current?.abort(); }, [active]);
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (!query.trim() || busy) return;
    current.current?.abort(); const controller = new AbortController(); current.current = controller;
    setBusy(true); setError(""); setResult(null);
    const request = { version: 1 as const, operation: "search" as const, query: query.trim() };
    try {
      const response = await fetchWithApiAuth(WORKFLOW_KNOWLEDGE_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }, { consume: async response => {
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Your Workflow access could not be verified." : "Workflow knowledge is temporarily unavailable.");
        return validateKnowledgeResponse(await readBoundedJsonResponse<unknown>(response, 96000), request);
      } });
      if (!controller.signal.aborted) setResult(response);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Workflow knowledge could not be read."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="everyagent-knowledge" aria-label="Workflow knowledge">
    <form onSubmit={search}>
      <input aria-label="Question about Workflow" placeholder="Find a role, procedure, or workflow…" maxLength={500} value={query} onChange={event => setQuery(event.target.value)} />
      <button type="submit" disabled={busy || !query.trim()} aria-label="Search Workflow"><Search size={17} /></button>
    </form>
    {busy && <p role="status">Reading Workflow…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite">
      <p className="everyagent-knowledge-label">{result.documents.length ? `From Workflow · ${result.documents.length} source matches` : "No matching source found. Try a role name or procedure topic."}</p>
      {result.documents.map(doc => <article key={doc.id}>
        <Link to={doc.href} onClick={onOpenSource}>{doc.title}<ArrowUpRight size={15} /></Link>
        <small>{doc.kind === 'skill' ? 'AlamoAgent reference' : doc.kind} · {doc.reviewStatus === 'review' ? 'In review' : 'Draft'} · v{doc.version}</small>
        {doc.excerpts.slice(0, 2).map((excerpt, i) => <p key={i}><strong>{excerpt.heading}</strong>{excerpt.text.length > 550 ? `${excerpt.text.slice(0, 550)}…` : excerpt.text}{excerpt.truncated && excerpt.text.length <= 550 ? '…' : ''}</p>)}
      </article>)}
      {result.documents.length > 0 && <p className="everyagent-knowledge-note">Source excerpts for review. These drafts are not approved clinical instructions.</p>}
    </div>}
  </section>;
}
