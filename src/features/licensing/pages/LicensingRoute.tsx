import { Navigate } from "react-router-dom";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";
import LicensingWorkspace from "./LicensingPage";

export default function LicensingRoute() {
  const allowed = useLicensingAccess();
  if (!allowed) return <Navigate to="/analytics" replace />;
  return <LicensingWorkspace />;
}
