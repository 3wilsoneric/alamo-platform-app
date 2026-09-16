interface PlatformWordmarkProps {
  collapsed?: boolean;
  display?: boolean;
}

export function PlatformWordmark({ collapsed = false, display = false }: PlatformWordmarkProps) {
  return (
    <span
      data-platform-wordmark="true"
      aria-label="Alamo Health"
      className={`inline-flex max-w-full min-w-0 items-center overflow-hidden whitespace-nowrap text-left font-sans font-semibold leading-none text-[#595959] transition-[width,opacity,transform] duration-200 ${
        collapsed
          ? "w-0 -translate-y-2 opacity-0"
          : display
            ? "w-[286px] translate-y-0 text-[36px] opacity-100 sm:text-[40px]"
            : "w-[218px] translate-y-0 text-[27px] opacity-100 max-[359px]:w-[188px] max-[359px]:text-[23px] sm:w-[240px] sm:text-[30px]"
      }`}
    >
      <span aria-hidden="true" className="font-black text-[#08745f]">
        Alamo
      </span>
      <span aria-hidden="true" className="ml-1">
        Health
      </span>
    </span>
  );
}
