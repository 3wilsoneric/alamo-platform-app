import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import type { LicensingUpdates as Updates } from "../../../../shared/licensing-contracts.mjs";
import { fetchLicensingUpdates } from "../licensingApi";
import { licensingDate } from "./LicensingReportReader";

export default function LicensingUpdates({ onSelect }: { onSelect: (id: string) => void }) {
  const [feed, setFeed] = useState<Updates | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void fetchLicensingUpdates(controller.signal).then((data) => { setFeed(data); setFailed(false); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); };
    refresh(); const timer = globalThis.setInterval(refresh, 60_000);
    return () => { controller.abort(); globalThis.clearInterval(timer); };
  }, []);
  return <div className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 text-sm text-[#42624a]"><Bell size={16} /> {feed?.alerts.length ? "New updates" : "Updates"}{(failed || feed?.status === "failed") && <span className="h-2 w-2 rounded-full bg-[#b57a3a]" />}</button>
    {open && <div role="region" aria-label="Licensing updates" className="absolute right-0 z-20 mt-2 max-h-[65vh] w-[min(360px,calc(100vw-40px))] overflow-y-auto rounded-lg border border-[#d0ddcf] bg-white p-5 shadow-lg">
      <h2 className="font-serif text-xl">State updates</h2>
      {feed?.schedule && <p className="mt-2 text-xs leading-6 text-[#6b7f6c]">Checked automatically every Monday and Wednesday at 9 a.m. Pacific.</p>}
      {failed || feed?.status === "failed" ? <p role="alert" className="mt-3 text-sm leading-6">{failed ? "Update status is unavailable. Your archived reports remain available." : "The latest check could not finish. Your last complete collection is still available."}</p> : <p className="mt-2 text-xs leading-6 text-[#6b7f6c]">{feed?.lastChecked ? `Last checked ${licensingDate(feed.lastChecked)}.` : "No completed update check yet."}</p>}
      {feed?.alerts.length ? <ul className="mt-4 space-y-4">{feed.alerts.map((a) => <li key={a.id} className="border-t border-[#e1e8df] pt-3 text-sm"><p className="font-medium">{a.community}</p><p className="mt-1">{a.title}{a.reportDate ? ` · ${licensingDate(a.reportDate)}` : ""}</p>{a.reportId ? <button type="button" onClick={() => { onSelect(a.reportId!); setOpen(false); }} className="mt-2 min-h-11 underline">Read brief</button> : null}</li>)}</ul> : !failed && feed?.status === "complete" ? <p className="mt-3 text-sm leading-6">No new or changed state records since the baseline.</p> : null}
    </div>}
  </div>;
}
