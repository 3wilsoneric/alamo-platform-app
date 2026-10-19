export function ExecutiveReferralStatusPill({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const tone = normalized.includes("accept") || normalized.includes("awaiting admit")
    ? "border-[#a9d2c0] bg-[#e3f3eb] text-[#1e684e]"
    : normalized.includes("declin") || normalized.includes("deni")
      ? "border-[#e2aaa4] bg-[#fae5e2] text-[#963c34]"
      : normalized === "under review"
        ? "border-[#dfc36f] bg-[#fff0bb] text-[#76580b]"
        : "border-[#bccaf0] bg-[#e8edfc] text-[#365ba9]";

  return (
    <span
      data-executive-referral-status="true"
      className={`inline-flex max-w-full truncate rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.05em] ${tone}`}
    >
      {status}
    </span>
  );
}
