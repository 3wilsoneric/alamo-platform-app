import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
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
  const updateCount = feed?.alerts.length ?? 0;
  return <div className="relative shrink-0">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbdad1] bg-white px-3 text-[13px] font-medium text-[#315c4c] shadow-[0_2px_8px_rgba(38,74,58,0.05)] transition-colors hover:bg-[#f4f8f5]"><Bell size={16} aria-hidden="true" /> <span>Updates</span>{updateCount ? <span aria-label={`${updateCount} licensing updates`} className="grid min-h-5 min-w-5 place-items-center rounded-full bg-[#dceee6] px-1 text-[11px] font-semibold text-[#176b52]">{updateCount}</span> : null}{(failed || feed?.status === "failed") && <span aria-label="Update check needs review" className="h-2 w-2 rounded-full bg-[#b57a3a]" />}</button>
    {open && <>
      <button type="button" aria-label="Close licensing updates" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-[#173c31]/20 backdrop-blur-[1px] sm:hidden" />
      <div role="region" aria-label="Licensing updates" data-licensing-updates-panel="true" className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-[20px] border border-[#c7d8ce] bg-[#fbfdfb] p-5 shadow-[0_22px_60px_rgba(25,57,45,0.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:z-20 sm:mt-2 sm:max-h-[65vh] sm:w-[360px] sm:rounded-xl sm:shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#708177]">Licensing monitor</p><h2 className="mt-1 font-serif text-[24px] leading-tight text-[#203f36]">State updates</h2></div>
          <button type="button" aria-label="Close state updates" onClick={() => setOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[#d8e3dc] bg-white text-[#49645a]"><X size={17} /></button>
        </div>
        {feed?.schedule && <p className="mt-4 rounded-xl bg-[#edf5f1] px-4 py-3 text-[13px] leading-5 text-[#4f6b5d]">Automatic checks run every <strong className="font-semibold text-[#285443]">Monday and Wednesday at 9 a.m. Pacific.</strong></p>}
        {failed || feed?.status === "failed" ? <p role="alert" className="mt-4 text-[15px] leading-6 text-[#40574d]">{failed ? "Update status is unavailable. Your archived reports remain available." : "The latest check could not finish. Your last complete collection is still available."}</p> : <p className="mt-3 text-[13px] leading-5 text-[#6b7f6c]">{feed?.lastChecked ? `Last checked ${licensingDate(feed.lastChecked)}.` : "No completed update check yet."}</p>}
        {feed?.alerts.length ? <ul className="mt-4 space-y-3">{feed.alerts.map((a) => <li key={a.id} className="rounded-xl border border-[#dbe6df] bg-white p-4 text-[14px] shadow-[0_2px_8px_rgba(38,74,58,0.04)]"><p className="font-semibold text-[#244c3e]">{a.community}</p><p className="mt-1.5 leading-6 text-[#52675d]">{a.title}{a.reportDate ? ` · ${licensingDate(a.reportDate)}` : ""}</p>{a.reportId ? <button type="button" onClick={() => { onSelect(a.reportId!); setOpen(false); }} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#e4f1eb] px-4 font-semibold text-[#176b52]">Read brief</button> : null}</li>)}</ul> : !failed && feed?.status === "complete" ? <p className="mt-4 rounded-xl border border-[#dbe6df] bg-white px-4 py-4 text-[14px] leading-6 text-[#52675d]">No new or changed state records since the baseline.</p> : null}
      </div>
    </>}
  </div>;
}
