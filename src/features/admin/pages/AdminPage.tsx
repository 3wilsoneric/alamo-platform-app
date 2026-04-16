import { useState } from "react";
import { Activity, BarChart3, Bot, FileText } from "lucide-react";
import Analytics from "../components/Analytics";
import ChatbotSettings from "../components/ChatbotSettings";
import KnowledgeBase from "../components/KnowledgeBase";
import RecentActivity from "../components/RecentActivity";

type TabKey = "knowledge" | "settings" | "activity" | "analytics";

export default function AdminPage() {
  const [selectedTab, setSelectedTab] = useState<TabKey>("knowledge");

  const tabs = [
    { key: "knowledge" as TabKey, label: "Knowledge Base", icon: FileText },
    { key: "settings" as TabKey, label: "Chatbot Settings", icon: Bot },
    { key: "analytics" as TabKey, label: "Analytics", icon: BarChart3 },
    { key: "activity" as TabKey, label: "Activity Log", icon: Activity }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage knowledge base and chatbot configuration
          </p>
        </div>

        <div className="mb-8 border-b border-gray-200">
          <div className="flex gap-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSelectedTab(tab.key)}
                  className={`flex items-center gap-2 border-b-2 pb-4 transition-colors ${
                    selectedTab === tab.key
                      ? "border-emerald-600 text-emerald-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedTab === "knowledge" && <KnowledgeBase />}
        {selectedTab === "settings" && <ChatbotSettings />}
        {selectedTab === "analytics" && <Analytics />}
        {selectedTab === "activity" && <RecentActivity />}
      </div>
    </div>
  );
}
