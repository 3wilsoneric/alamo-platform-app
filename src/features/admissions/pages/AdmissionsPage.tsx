import { ArrowLeft, ArrowUpRight, ClipboardCheck, ShieldCheck } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { Link } from "react-router-dom";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountAdmissionsAccess } from "../../../shared/auth/admissionsAccess";
import { getPipelineAppUrl } from "../../../../shared/pipeline-app-url.mjs";

export default function AdmissionsPage() {
  const { accounts } = useMsal();
  const access = getAccountAdmissionsAccess(accounts[0], isE2EAuthBypassEnabled);
  const pipelineAppUrl = getPipelineAppUrl(
    import.meta.env.VITE_PIPELINE_APP_URL,
    window.location.origin
  );

  if (!access.allowed) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-3xl items-center px-4 py-12 sm:px-8">
        <div className="w-full border-y border-[#111111] py-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a04436]">
            Admissions access
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight text-[#111111]">
            Your account is not assigned to Admissions.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#595959]">
            Ask an Entra administrator to assign an Alamo Admissions role, then sign out and back in.
          </p>
          <Link
            to="/home"
            className="mt-7 inline-flex items-center gap-2 text-[14px] font-bold text-[#0f8b73] hover:text-[#0c705f]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Alamo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-5xl items-center px-4 py-12 sm:px-8">
      <div className="w-full">
        <div className="border-b-2 border-[#111111] pb-7">
          <div className="flex items-center gap-3 text-[#0f8b73]">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Admissions</p>
          </div>
          <h1 className="mt-4 max-w-3xl text-[42px] font-semibold leading-[1.05] text-[#111111] sm:text-[54px]">
            Referral packets and assessments.
          </h1>
        </div>

        <div className="grid gap-8 border-b border-[#111111] py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-[18px] font-semibold text-[#111111]">Pipeline admissions workspace</p>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#595959]">
              Work referrals, complete assessments, and record admission decisions against Alamo's governed census.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-[#315b54]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Microsoft sign-in continues in Pipeline
            </div>
          </div>
          <a
            href={pipelineAppUrl}
            className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#0f8b73] bg-[#0f8b73] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#0c705f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73]"
          >
            Open Pipeline
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
