import { AlertCircle, RefreshCw, Upload } from "lucide-react";

export default function RecentActivity() {
  const recentActivity = [
    { time: "10:45 AM", action: "Document uploaded", detail: "Behavioral Health Assessment Forms", user: "Dr. James Martinez", type: "upload" },
    { time: "10:32 AM", action: "Document re-indexed", detail: "Incident Reporting Procedure", user: "Name", type: "update" },
    { time: "10:15 AM", action: "Document deactivated", detail: "Client Intake Procedures", user: "Name", type: "status" },
    { time: "9:58 AM", action: "Document uploaded", detail: "Medication Error Reporting", user: "Name", type: "upload" },
    { time: "9:42 AM", action: "Settings updated", detail: "Changed response style to Friendly", user: "Name", type: "update" },
    { time: "9:28 AM", action: "Document re-indexed", detail: "Fire Safety Procedures", user: "Carlos Rodriguez", type: "update" },
    { time: "9:15 AM", action: "Document uploaded", detail: "Crisis Intervention Training", user: "Emily Rodriguez", type: "upload" },
    { time: "8:52 AM", action: "Document deactivated", detail: "Outdated Policy Document", user: "Patricia Moore", type: "status" }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-bold uppercase text-gray-900">Recent Activity</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {recentActivity.map((activity, index) => (
          <div key={index} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`rounded p-2 ${
                    activity.type === "upload"
                      ? "bg-green-100"
                      : activity.type === "update"
                        ? "bg-blue-100"
                        : "bg-amber-100"
                  }`}
                >
                  {activity.type === "upload" ? (
                    <Upload size={16} className="text-green-600" />
                  ) : activity.type === "update" ? (
                    <RefreshCw size={16} className="text-blue-600" />
                  ) : (
                    <AlertCircle size={16} className="text-amber-600" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{activity.action}</div>
                  <div className="text-sm text-gray-600">{activity.detail}</div>
                  <div className="mt-1 text-xs text-gray-500">by {activity.user}</div>
                </div>
              </div>
              <span className="text-xs text-gray-500">{activity.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
