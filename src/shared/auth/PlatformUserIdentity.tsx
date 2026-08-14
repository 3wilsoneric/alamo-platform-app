import { UserRound } from "lucide-react";
import { useCurrentUserProfile } from "./appUserProfile";

interface PlatformUserIdentityProps {
  className?: string;
  nameSide?: "left" | "right";
}

export function PlatformUserIdentity({
  className = "",
  nameSide = "left"
}: PlatformUserIdentityProps) {
  const { displayName } = useCurrentUserProfile();

  return (
    <div
      data-platform-user-identity="true"
      className={`group relative inline-flex min-w-0 items-center ${className}`}
      aria-label={`Signed in as ${displayName}`}
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        data-platform-user-name="true"
        className={`pointer-events-none absolute bottom-1/2 max-w-[220px] translate-y-1/2 whitespace-nowrap rounded-full border border-[#d9d9d9] bg-white px-3 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-[#333333] opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 ${
          nameSide === "right"
            ? "left-[calc(100%+10px)] -translate-x-1"
            : "right-[calc(100%+10px)] translate-x-1"
        }`}
      >
        {displayName}
      </span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d9d9d9] bg-white text-[#595959] transition-[border-color,color] duration-150 group-hover:border-[#0f8b73] group-hover:text-[#0f8b73] group-focus-visible:border-[#0f8b73] group-focus-visible:text-[#0f8b73]">
        <UserRound className="h-[18px] w-[18px] stroke-[1.9]" aria-hidden="true" />
      </span>
    </div>
  );
}
