import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { ExecutiveIncidentRegister } from "../../executive/components/ExecutiveIncidentRegister";

export default function IncidentHistoryPage() {
  const [searchParams] = useSearchParams();
  const requestedFacility = searchParams.get("facilityId") || "all";
  const facilityId = ALAMO_FACILITIES.some((facility) => facility.facilityId === requestedFacility) ? requestedFacility : "all";
  return <div data-incident-history-page="true" className="mx-auto max-w-[1432px] pb-10 text-[#16283a]">
    <Link to={facilityId === "all" ? "/incidents" : `/incidents?community=${facilityId}`} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[#82503d] hover:underline"><ArrowLeft size={17} aria-hidden="true" />Incidents</Link>
    <h1>Incident history</h1>
    <ExecutiveIncidentRegister key={facilityId} facilityId={facilityId} mode="platform" />
  </div>;
}
