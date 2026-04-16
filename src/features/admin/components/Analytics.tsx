export default function Analytics() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-600">Total Queries</div>
          <div className="text-2xl font-bold text-gray-900">1,247</div>
          <div className="mt-1 text-xs text-gray-500">This month</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-600">
            Avg Response Time
          </div>
          <div className="text-2xl font-bold text-gray-900">1.2s</div>
          <div className="mt-1 text-xs text-green-600">↓ 0.3s from last month</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-600">Success Rate</div>
          <div className="text-2xl font-bold text-gray-900">94%</div>
          <div className="mt-1 text-xs text-gray-500">Questions answered</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-600">Active Users</div>
          <div className="text-2xl font-bold text-gray-900">87</div>
          <div className="mt-1 text-xs text-gray-500">Past 7 days</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Most Queried Documents</h3>
        <div className="space-y-3">
          {[
            { doc: "Incident Reporting Procedure", queries: 156 },
            { doc: "Medication Administration Policy", queries: 142 },
            { doc: "Emergency Response Protocol", queries: 128 },
            { doc: "HIPAA Compliance Guidelines", queries: 94 },
            { doc: "Staff Training Manual", queries: 87 }
          ].map((item) => (
            <div key={item.doc} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{item.doc}</span>
              <div className="flex items-center gap-3">
                <div className="h-2 w-48 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{ width: `${(item.queries / 156) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-semibold text-gray-900">
                  {item.queries}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Common Questions</h3>
        <div className="space-y-2">
          {[
            "What is the incident reporting procedure?",
            "How do I administer medication?",
            "What are the emergency response steps?",
            "Where can I find HIPAA guidelines?",
            "How do I complete staff training?"
          ].map((question) => (
            <div key={question} className="border-b border-gray-100 py-2 text-sm text-gray-700 last:border-0">
              {question}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
