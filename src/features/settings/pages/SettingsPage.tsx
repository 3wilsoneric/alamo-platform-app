import { type ElementType, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Globe,
  Key,
  Laptop,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  User
} from "lucide-react";

type SettingsSection =
  | "profile"
  | "notifications"
  | "security"
  | "appearance"
  | "data"
  | "integrations";

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: ElementType;
  description: string;
}

const navItems: NavItem[] = [
  { id: "profile", label: "Profile", icon: User, description: "Personal info & preferences" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Alerts & digest settings" },
  { id: "security", label: "Security", icon: Shield, description: "Password, 2FA, sessions" },
  { id: "appearance", label: "Appearance", icon: Palette, description: "Theme & display options" },
  { id: "data", label: "Data & Privacy", icon: Database, description: "Export, retention, access" },
  { id: "integrations", label: "Integrations", icon: Globe, description: "Connected services" }
];

const avatarUrl =
  "https://api.dicebear.com/7.x/lorelei/svg?seed=PlatformUser&backgroundColor=f5f3ef,e8efe7,dfe8f4&hair=variant04,variant08&skinColor=f2d3b1";

function ProfileSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your personal information and display preferences.
        </p>
      </div>

      <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <img
          src={avatarUrl}
          alt="Avatar"
          className="h-16 w-16 rounded-full bg-emerald-600 ring-2 ring-emerald-200"
        />
        <div>
          <p className="text-sm font-semibold text-gray-800">Profile Photo</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Auto-generated avatar based on your name
          </p>
          <button className="mt-2 text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700">
            Change avatar style →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {[
          { label: "First Name", value: "Name" },
          { label: "Last Name", value: "" },
          { label: "Job Title", value: "Company Role" },
          { label: "Department", value: "Department" },
          { label: "Email", value: "name@company.com" },
          { label: "Phone", value: "+1 (555) 000-0000" }
        ].map((field) => (
          <div
            key={field.label}
            className={field.label === "Job Title" || field.label === "Email" ? "col-span-2" : ""}
          >
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              {field.label}
            </label>
            <input
              type="text"
              defaultValue={field.value}
              className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [settings, setSettings] = useState({
    emailDigest: true,
    reportAlerts: true,
    workforceUpdates: false,
    systemAlerts: true,
    weeklyReports: true,
    realtime: false
  });

  const toggle = (key: keyof typeof settings) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const items = [
    { key: "emailDigest", label: "Email Digest", desc: "Daily summary of platform activity" },
    { key: "reportAlerts", label: "Report Alerts", desc: "Notify when new reports are available" },
    { key: "workforceUpdates", label: "Workforce Updates", desc: "Changes to workforce data" },
    { key: "systemAlerts", label: "System Alerts", desc: "Maintenance windows and outages" },
    { key: "weeklyReports", label: "Weekly Reports", desc: "Automated weekly summary email" },
    { key: "realtime", label: "Real-time Notifications", desc: "In-app push notifications" }
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        <p className="mt-1 text-sm text-gray-500">Choose how and when you receive alerts.</p>
      </div>

      <div className="space-y-3">
        {items.map(({ key, label, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                settings[key] ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings[key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecuritySection() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Security</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your password, two-factor authentication, and active sessions.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Key size={16} className="text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-800">Change Password</h3>
        </div>
        {["Current Password", "New Password", "Confirm New Password"].map((label) => (
          <div key={label}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              {label}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        ))}
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
          Update Password
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Two-Factor Authentication</h3>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Add an extra layer of security to your account.
            </p>
          </div>
          <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
            Enable 2FA
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-800">Active Sessions</h3>
        {[
          { device: "Chrome on macOS", location: "Boise, ID", current: true },
          { device: "Safari on iPhone", location: "Boise, ID", current: false }
        ].map((session) => (
          <div
            key={session.device}
            className="mb-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4"
          >
            <div className="flex items-center gap-3">
              <Monitor size={16} className="text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-800">{session.device}</p>
                <p className="text-xs text-gray-500">{session.location}</p>
              </div>
            </div>
            {session.current ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                Current
              </span>
            ) : (
              <button className="text-xs font-medium text-red-500 transition-colors hover:text-red-600">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Appearance</h2>
        <p className="mt-1 text-sm text-gray-500">
          Customize how the platform looks and feels.
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
            { id: "system", label: "System", icon: Laptop }
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                theme === id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <Icon size={20} className={theme === id ? "text-emerald-600" : "text-gray-500"} />
              <span className={`text-sm font-medium ${theme === id ? "text-emerald-700" : "text-gray-600"}`}>
                {label}
              </span>
              {theme === id && <Check size={14} className="text-emerald-500" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Display Density</h3>
        <div className="space-y-2">
          {(["compact", "comfortable", "spacious"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setDensity(value)}
              className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 transition-all ${
                density === value
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <span className={`text-sm font-medium capitalize ${density === value ? "text-emerald-700" : "text-gray-700"}`}>
                {value}
              </span>
              {density === value && <Check size={16} className="text-emerald-500" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{label}</h2>
        <p className="mt-1 text-sm text-gray-500">This section is under construction.</p>
      </div>
      <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">Coming soon</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  const renderSection = () => {
    switch (activeSection) {
      case "profile":
        return <ProfileSection />;
      case "notifications":
        return <NotificationsSection />;
      case "security":
        return <SecuritySection />;
      case "appearance":
        return <AppearanceSection />;
      case "data":
        return <PlaceholderSection label="Data & Privacy" />;
      case "integrations":
        return <PlaceholderSection label="Integrations" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your account, preferences, and platform settings.
          </p>
        </div>

        <div className="flex gap-7">
          <nav className="w-56 flex-shrink-0">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3.5 text-left transition-all last:border-0 ${
                      isActive
                        ? "border-l-2 border-l-emerald-500 bg-emerald-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={17} className={isActive ? "text-emerald-600" : "text-gray-400"} />
                    <div>
                      <p className={`text-sm font-medium leading-tight ${isActive ? "text-emerald-700" : "text-gray-700"}`}>
                        {item.label}
                      </p>
                    </div>
                    {isActive && <ChevronRight size={14} className="ml-auto text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="min-h-[500px] flex-1 rounded-xl border border-gray-200 bg-white p-7">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
