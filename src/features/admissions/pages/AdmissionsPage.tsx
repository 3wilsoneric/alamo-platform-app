import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { fetchAdmissionsDashboard, type AdmissionsDashboardResponse } from "../../../shared/api/platformData";
import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import { CALIFORNIA_COMMUNITIES } from "../../california/data/californiaCommunities";
import { ProgressModal } from "../components/PipelineBoard";
import ActiveIntakeJourney from "../components/ActiveIntakeJourney";
import "../admissionsVisual.css";

// The current production Admissions surface, restored as a source owner. The
// existing fetch, abort/retry lifecycle, and client-file dialog stay unchanged.
export default function AdmissionsPage() {
  const [dashboard, setDashboard] = useState<AdmissionsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [card, setCard] = useState<AdmissionsBoardCard | null>(null);
  const [params, setParams] = useSearchParams();
  const facilityId = params.get("community") || "";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    fetchAdmissionsDashboard(controller.signal).then(value => { if (!controller.signal.aborted) setDashboard(value); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const pipeline = dashboard?.referral_pipeline?.status === "connected" ? dashboard.referral_pipeline : null;
  return <main className="admissions-brief-page" data-admissions-brief-page="true" data-admissions-overview="true" aria-label="Admissions brief">
    <header className="intake-page-heading"><h1 className="platform-page-title">Admissions</h1>
      <label className="intake-scope-control"><span aria-hidden="true">{CALIFORNIA_COMMUNITIES.find(value => value.facilityId === facilityId)?.shortName ?? "All communities"}<ChevronDown size={16} /></span>
        <select aria-label="Admissions community" value={facilityId} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set("community", event.target.value); else next.delete("community"); setCard(null); setParams(next); }}><option value="">All communities</option>{CALIFORNIA_COMMUNITIES.map(value => <option key={value.facilityId} value={value.facilityId}>{value.shortName}</option>)}</select>
      </label>
    </header>
    {loading ? <p role="status">Loading admissions…</p> : failed ? <div role="alert">Admissions data is unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : <ActiveIntakeJourney pipeline={pipeline} facilityId={facilityId || null} onOpenCard={setCard} />}
    {card && pipeline && <ProgressModal card={card} generatedAt={pipeline.generatedAt} onClose={() => setCard(null)} />}
  </main>;
}
