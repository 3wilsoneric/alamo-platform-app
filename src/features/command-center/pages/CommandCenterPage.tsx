import { useState } from "react";
import {
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  Users,
  XCircle
} from "lucide-react";

const systemHealth = [
  { label: "Source Data Pull", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: Database },
  { label: "Azure Transform Layer", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: ServerCog },
  { label: "Snapshot Package", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: CheckCircle2 },
  { label: "Desktop Preload", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: ShieldCheck },
  { label: "Role Access Sync", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: Users },
  { label: "Security Controls", status: "Pending", detail: "Awaiting live health binding.", healthy: false, icon: Lock }
];

const roles = [
  { name: "Executive Role", access: "Role scope placeholder", users: 0 },
  { name: "Regional Operations", access: "Role scope placeholder", users: 0 },
  { name: "Facility Leadership", access: "Role scope placeholder", users: 0 },
  { name: "Admin Support", access: "Role scope placeholder", users: 0 },
  { name: "Platform Admin", access: "Role scope placeholder", users: 0 }
];

const securityItems = [
  { label: "Microsoft authentication", value: "Pending" },
  { label: "Role-based access control", value: "Pending" },
  { label: "Facility-scoped permissions", value: "Pending" },
  { label: "Audit trail", value: "Pending" },
  { label: "Snapshot version tracking", value: "Pending" },
  { label: "Manual admin override", value: "Pending" }
];

const controlActions = [
  "Review role access and permission groups",
  "Inspect latest mart build and snapshot timestamps",
  "Disable a user or force sign-out",
  "Trigger a manual snapshot regeneration",
  "Mark a system degraded and alert leadership",
  "Open daily triage notes for follow-up"
];

export default function CommandCenterPage() {
  const [rolePage, setRolePage] = useState(0);
  const [securityPage, setSecurityPage] = useState(0);
  const [controlsPage, setControlsPage] = useState(0);

  const rolesPerPage = 3;
  const securityPerPage = 3;
  const controlsPerPage = 3;

  const pagedRoles = roles.slice(rolePage * rolesPerPage, rolePage * rolesPerPage + rolesPerPage);
  const pagedSecurity = securityItems.slice(
    securityPage * securityPerPage,
    securityPage * securityPerPage + securityPerPage
  );
  const pagedControls = controlActions.slice(
    controlsPage * controlsPerPage,
    controlsPage * controlsPerPage + controlsPerPage
  );

  const rolePages = Math.ceil(roles.length / rolesPerPage);
  const securityPages = Math.ceil(securityItems.length / securityPerPage);
  const controlPages = Math.ceil(controlActions.length / controlsPerPage);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Internal
          </p>
          <h1 className="mt-1.5 text-[1.85rem] font-semibold tracking-tight text-slate-900">
            Command Center
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-600">
            Internal engineering and admin control room for system health, role access,
            security posture, and platform operations.
          </p>
        </div>

        <div className="rounded-[16px] border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Snapshot Version
          </div>
          <div className="mt-1 text-[1rem] font-semibold text-slate-400">—</div>
        </div>
      </header>

      <section className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="grid gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
          {systemHealth.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`text-[12px] font-semibold ${
                      item.healthy ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                      {item.status}
                    </span>
                    <span className="text-[11px] leading-4 text-slate-500">{item.detail}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-slate-500" />
              <h2 className="text-[15px] font-semibold text-slate-900">Role Access</h2>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: rolePages }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => setRolePage(index)}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    index === rolePage ? "bg-slate-700" : "bg-slate-200 hover:bg-slate-300"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {pagedRoles.map((role) => (
                <div key={role.name} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold text-slate-900">{role.name}</div>
                    <div className="mt-0.5 text-[12px] leading-5 text-slate-600">{role.access}</div>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Pending
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-rows-[auto_auto]">
          <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-slate-500" />
                <h2 className="text-[15px] font-semibold text-slate-900">Security and Access</h2>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: securityPages }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSecurityPage(index)}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      index === securityPage ? "bg-slate-700" : "bg-slate-200 hover:bg-slate-300"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {pagedSecurity.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[12px] font-medium text-slate-700">{item.label}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <h2 className="text-[15px] font-semibold text-slate-900">Admin Controls</h2>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: controlPages }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setControlsPage(index)}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      index === controlsPage ? "bg-slate-700" : "bg-slate-200 hover:bg-slate-300"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {pagedControls.map((action) => (
                <div key={action} className="py-3 text-[12px] font-medium leading-5 text-slate-700">
                  {action}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
