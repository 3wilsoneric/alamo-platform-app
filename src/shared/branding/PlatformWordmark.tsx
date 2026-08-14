interface PlatformWordmarkProps {
  collapsed?: boolean;
  display?: boolean;
}

export function PlatformWordmark({ collapsed = false, display = false }: PlatformWordmarkProps) {
  return (
    <span
      data-platform-wordmark="true"
      aria-label="Alamo Health"
      className={`inline-flex max-w-full min-w-0 items-center overflow-hidden whitespace-nowrap text-left transition-[width,opacity,transform] duration-200 ${
        collapsed
          ? "w-0 -translate-y-2 opacity-0"
          : display
            ? "w-[286px] translate-y-0 opacity-100"
            : "w-[218px] translate-y-0 opacity-100 sm:w-[240px]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`font-sans font-bold leading-none tracking-[-0.055em] text-[#0f8b73] ${
          display ? "text-[36px] sm:text-[40px]" : "text-[27px] sm:text-[30px]"
        }`}
      >
        Alamo
      </span>
      <span
        aria-hidden="true"
        className={`ml-1.5 font-sans font-medium leading-none tracking-[-0.04em] text-[#315b54] ${
          display ? "text-[27px] sm:text-[31px]" : "text-[20px] sm:text-[23px]"
        }`}
      >
        Health
      </span>
    </span>
  );
}
