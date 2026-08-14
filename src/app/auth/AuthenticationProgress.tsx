import { PlatformWordmark } from "../../shared/branding/PlatformWordmark";

export function AuthenticationProgress({
  label = "Signing you in",
  detail = "Connecting to Microsoft..."
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f7f7f5_0%,#efefec_100%)] px-5 py-10 text-[#111111] sm:px-8">
      <section
        role="status"
        aria-live="polite"
        data-authentication-progress="true"
        className="w-full max-w-[460px] border border-black/10 bg-white px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.09)] sm:px-9 sm:py-9"
      >
        <div className="border-b border-[#e1dfdd] pb-6">
          <PlatformWordmark display />
        </div>
        <div className="pt-7">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em] text-[#1b1a19]">{label}</h1>
          <div className="mt-5 flex items-center gap-3 text-[14px] text-[#605e5c]">
            <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-[#c8c6c4] border-t-[#0f8b73]" aria-hidden="true" />
            {detail}
          </div>
        </div>
      </section>
    </main>
  );
}
