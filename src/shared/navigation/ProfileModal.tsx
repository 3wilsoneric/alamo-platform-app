import { Bell, ChevronRight, LogOut, Settings, Shield, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProfileModalProps {
  onClose: () => void;
  onOpenSettings?: () => void;
}

const avatarUrl =
  "https://api.dicebear.com/7.x/lorelei/svg?seed=PlatformUser&backgroundColor=f5f3ef,e8efe7,dfe8f4&hair=variant04,variant08&skinColor=f2d3b1";

export default function ProfileModal({ onClose, onOpenSettings }: ProfileModalProps) {
  const navigate = useNavigate();

  const handleSettingsClick = () => {
    onClose();
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }

    navigate("/settings");
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="border-b border-gray-100 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={avatarUrl}
                alt="Profile Avatar"
                className="h-14 w-14 rounded-full bg-emerald-600 object-cover ring-2 ring-emerald-200"
              />
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div>
              <div className="text-base font-semibold text-gray-900">Name</div>
              <div className="mt-0.5 text-sm text-gray-500">
                Company Role
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Shield size={11} />
                Admin Access
              </div>
            </div>
          </div>
        </div>

        <div className="py-2">
          <button className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-emerald-50">
                <User size={16} className="text-gray-500 transition-colors group-hover:text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">My Profile</span>
            </div>
            <ChevronRight size={15} className="text-gray-400" />
          </button>

          <button
            onClick={handleSettingsClick}
            className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-emerald-50">
                <Settings
                  size={16}
                  className="text-gray-500 transition-colors group-hover:text-emerald-600"
                />
              </div>
              <span className="text-sm font-medium text-gray-700">Settings</span>
            </div>
            <ChevronRight size={15} className="text-gray-400" />
          </button>

          <button className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-emerald-50">
                <Bell size={16} className="text-gray-500 transition-colors group-hover:text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Notifications</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                3
              </span>
              <ChevronRight size={15} className="text-gray-400" />
            </div>
          </button>
        </div>

        <div className="border-t border-gray-100 py-2">
          <button className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-red-100">
              <LogOut size={16} className="text-gray-500 transition-colors group-hover:text-red-500" />
            </div>
            <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-red-600">
              Sign Out
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
