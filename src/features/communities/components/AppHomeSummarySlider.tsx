import { ArrowRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function getComparisonRatio(value: number, maxValue: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.max(value / maxValue, 0.08);
}

export function MiniTrend({
  items,
  activeLabel,
  onSelect
}: {
  items: Array<{ label: string; value: number }>;
  activeLabel?: string | null;
  onSelect?: (label: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-[18px] bg-white/50 px-6 text-center text-[13px] leading-6 text-[#8b7b68]">
        Incident trend data has not been loaded yet.
      </div>
    );
  }

  const displayItems = items
    .map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? item.value : 0
    }))
    .slice(-5);
  const maxValue = Math.max(...displayItems.map((item) => item.value), 1);

  return (
    <div className="flex h-full w-full flex-col px-1 py-2">
      <div className="flex-1 space-y-3">
        {displayItems.map((item, index) => {
          const isLatest = index === displayItems.length - 1;
          const ratio = getComparisonRatio(item.value, maxValue);

          return (
            <button
              key={item.label}
              type="button"
              data-mini-trend-label={item.label}
              onClick={() => onSelect?.(item.label)}
              className={`w-full rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-[#fffdfa] ${
                item.label === activeLabel
                  ? "bg-[#eef8f5] ring-1 ring-[#0f8b73]"
                  : isLatest
                    ? "bg-[#fff7ee]"
                    : "bg-white/58"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-[68px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7c664c]">
                  {item.label}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-[#ece5db]">
                    <div
                      className={`h-full rounded-full ${isLatest ? "bg-[#0f8b73]" : "bg-[#cfc5b7]"}`}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="w-[70px] shrink-0 text-right">
                  <div className="text-[14px] font-semibold tracking-[-0.03em] text-[#201a14]">
                    {formatNumber(item.value)}
                  </div>
                  <div className="mt-0.5 min-h-[12px] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0f8b73]">
                    {isLatest ? "Latest" : ""}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardSummarySlider({
  slides
}: {
  slides: Array<{ navLabel: string; title: string; body: string; content: ReactNode }>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  if (!slides.length) return null;

  const activeSlide = slides[Math.min(activeIndex, slides.length - 1)];
  if (!activeSlide) return null;

  return (
    <section data-community-overview-slider="true" className="mt-3 rounded-[30px] bg-[linear-gradient(180deg,#fffdfa_0%,#f5efe6_100%)] px-4 py-4 shadow-[0_24px_60px_-48px_rgba(91,74,54,0.18)] sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.navLabel}
              type="button"
              data-community-overview-tab={slide.navLabel}
              onClick={() => setActiveIndex(index)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                index === activeIndex
                  ? "border-[#0f8b73] bg-[#eef8f5] text-[#0f6f5d]"
                  : "border-[#d8d0c3] bg-white/70 text-[#736657] hover:bg-[#fffdfa]"
              }`}
            >
              {slide.navLabel}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7b68]">
          {activeIndex + 1} / {slides.length}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.55fr)]">
        <div className="rounded-[24px] bg-white/42 p-4">
          <h2
            className="text-[28px] leading-[1.05] tracking-[-0.045em] text-[#201a14] md:text-[34px]"
            style={{ fontFamily: "Merriweather, Georgia, serif" }}
          >
            {activeSlide.title}
          </h2>
          <p
            className="mt-4 text-[14px] leading-7 text-[#5f5346] md:text-[15px]"
            style={{ fontFamily: "Merriweather, Georgia, serif" }}
          >
            {activeSlide.body}
          </p>
        </div>
        <div className="min-w-0">{activeSlide.content}</div>
      </div>
    </section>
  );
}

export function SliderDataCard({
  title,
  children,
  className = ""
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-slider-card-title={title} className={`min-w-0 rounded-[22px] bg-white/50 p-3 ${className}`.trim()}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c664c]">{title}</div>
      {children}
    </div>
  );
}

export function SliderRows({
  rows,
  emptyLabel
}: {
  rows: Array<{
    id: string;
    title: string;
    meta?: string;
    value: string;
    tone?: "blue" | "red" | "neutral";
    actionLabel?: string;
    onClick?: () => void;
  }>;
  emptyLabel: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-[150px] items-center justify-center rounded-[18px] bg-white/50 px-5 text-center text-[12px] leading-6 text-[#8b7b68]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => {
        const rowClassName =
          "group flex min-w-0 w-full flex-col items-stretch gap-2 rounded-[14px] bg-white/58 px-3 py-2.5 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b73] focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4";
        const content = (
          <>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-5 text-[#201a14] sm:truncate">{row.title}</div>
              {row.meta ? <div className="mt-0.5 truncate text-[11px] text-[#8b7b68]">{row.meta}</div> : null}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-start">
              <div
                className={`text-right text-[15px] font-semibold ${
                  row.tone === "red" ? "text-[#b42318]" : row.tone === "blue" ? "text-[#0f6f5d]" : "text-[#201a14]"
                }`}
              >
                {row.value}
              </div>
              {row.onClick && row.actionLabel ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#736657] transition-colors group-hover:text-[#0f6f5d]">
                  {row.actionLabel}
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
              ) : null}
            </div>
          </>
        );

        return row.onClick ? (
          <button
            key={row.id} type="button" data-slider-row-id={row.id} data-slider-row-title={row.title}
            aria-label={`${row.title}: ${row.value}. ${row.actionLabel ?? "Open"}`} onClick={row.onClick} className={rowClassName}>
            {content}
          </button>
        ) : (
          <div key={row.id} data-slider-row-id={row.id} data-slider-row-title={row.title} className={rowClassName}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
