import { useMemo, useState } from "react";
import { Search, Waypoints } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProfileModal from "./ProfileModal";
import { getGroupedSearchResults, getTopSearchResult } from "../search/searchService";

interface PlatformHeaderProps {
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}

const avatarUrl =
  "https://api.dicebear.com/7.x/lorelei/svg?seed=PlatformUser&backgroundColor=f5f3ef,e8efe7,dfe8f4&hair=variant04,variant08&skinColor=f2d3b1";

export default function PlatformHeader({
  searchTerm: externalSearchTerm,
  onSearchChange: externalOnSearchChange
}: PlatformHeaderProps) {
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const searchTerm =
    externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const onSearchChange = externalOnSearchChange || setInternalSearchTerm;
  const groupedResults = useMemo(
    () => getGroupedSearchResults(searchTerm, 4),
    [searchTerm]
  );
  const topResult = useMemo(() => getTopSearchResult(searchTerm), [searchTerm]);
  const showResults = searchFocused && searchTerm.trim().length > 0;

  const openSearchResult = (route?: string) => {
    if (!route) return;
    navigate(route);
    setSearchExpanded(false);
    setSearchFocused(false);
    onSearchChange("");
  };

  return (
    <div className="bg-white px-6 py-2.5">
      <div className="flex items-center">
        <button onClick={() => navigate("/home")} className="mr-6">
          <div className="flex flex-col leading-none transition-opacity hover:opacity-80">
            <span className="text-[24px] font-bold tracking-tight text-gray-900">
              Alamo <span className="font-semibold text-gray-700">Health</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Data Platform
            </span>
          </div>
        </button>

        <div className="relative mr-auto flex items-center gap-3">
          <div
            className={`relative overflow-visible transition-all duration-300 ${
              searchExpanded || searchTerm.trim()
                ? "w-[520px] border-b border-slate-300"
                : "w-9"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setSearchExpanded(true);
              }}
              className="absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center text-gray-400"
            >
              <Search size={17} />
            </button>
            <input
              type="text"
              placeholder="Search dashboards, reports, workforce..."
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && topResult?.route) {
                  openSearchResult(topResult.route);
                }
              }}
              onFocus={() => {
                setSearchExpanded(true);
                setSearchFocused(true);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setSearchFocused(false);
                  if (!searchTerm.trim()) {
                    setSearchExpanded(false);
                  }
                }, 120);
              }}
              className={`h-9 w-full bg-transparent pl-9 pr-3 text-[13px] text-gray-700 outline-none placeholder:text-gray-400 ${
                searchExpanded || searchTerm.trim() ? "opacity-100" : "opacity-0"
              }`}
            />

            {showResults && (
              <div className="absolute left-0 top-full z-50 mt-3 w-[520px] overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_24px_50px_-30px_rgba(15,23,42,0.28)]">
                {groupedResults.length > 0 ? (
                  <div className="max-h-[420px] overflow-y-auto p-2">
                    {groupedResults.map((group) => (
                      <div key={group.type} className="mb-2 last:mb-0">
                        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          {group.label}
                        </div>
                        <div className="space-y-1">
                          {group.results.map((result) => (
                            <button
                              key={result.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => openSearchResult(result.route)}
                              className="flex w-full items-start justify-between rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                            >
                              <div>
                                <div className="text-[13px] font-semibold text-slate-900">
                                  {result.title}
                                </div>
                                {result.subtitle && (
                                  <div className="mt-0.5 text-[12px] leading-5 text-slate-500">
                                    {result.subtitle}
                                  </div>
                                )}
                              </div>
                              <div className="ml-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                {group.label.slice(0, -1) || group.label}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-[12px] leading-5 text-slate-500">
                    No direct matches. Try a page, community, report, or use Ask Helper for broader questions.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate("/command-center")}
          title="Command Center"
          aria-label="Open Command Center"
          className="ml-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Waypoints size={16} />
        </button>

        <div className="group relative ml-3">
          <button
            onClick={() => setShowProfileMenu((value) => !value)}
            className="flex h-9 items-center rounded-full transition-all"
          >
            <img
              src={avatarUrl}
              alt="Profile Avatar"
              className="h-8 w-8 rounded-full bg-emerald-600 object-cover"
            />
            <div
              className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-white pl-11 pr-2.5 transition-all duration-200 group-hover:w-[216px] group-hover:opacity-100 ${
                showProfileMenu ? "w-[216px] opacity-100" : "w-8 opacity-0"
              }`}
            >
              <div className="text-[13px] font-semibold leading-4 text-gray-900">
                Name
              </div>
              <div className="text-[11px] leading-4 text-gray-500">
                Company Role
              </div>
            </div>
          </button>

          {showProfileMenu && (
            <div>
              <ProfileModal
                onClose={() => setShowProfileMenu(false)}
                onOpenSettings={() => navigate("/settings")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
