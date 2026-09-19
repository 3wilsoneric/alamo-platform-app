interface PlatformWordmarkProps {
  collapsed?: boolean;
  display?: boolean;
}

export function PlatformWordmark({ collapsed = false, display = false }: PlatformWordmarkProps) {
  return (
    <span
      data-platform-wordmark="true"
      data-platform-wordmark-variant={display ? "display" : "standard"}
      aria-label="Alamo Health Management"
      className={`inline-flex max-w-full min-w-0 items-center overflow-hidden transition-[width,opacity,transform] duration-200 ${
        collapsed
          ? "h-[43px] w-0 -translate-y-2 opacity-0"
          : display
            ? "h-[66px] w-[340px] translate-y-0 opacity-100"
            : "h-[43px] w-[220px] translate-y-0 opacity-100 max-[359px]:w-[162px]"
      }`}
    >
      <img
        data-platform-brand-logo="true"
        src="/brand/alamo-health-management-logo.png"
        alt=""
        aria-hidden="true"
        draggable="false"
        className="block h-auto w-full object-contain object-left"
      />
    </span>
  );
}
