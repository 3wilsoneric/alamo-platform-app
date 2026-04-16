export default function ChatbotSettings() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Response Configuration</h3>

        <div className="space-y-6">
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700">Response Style</label>
            <div className="space-y-2">
              {["Professional & Formal", "Friendly & Conversational", "Technical & Detailed"].map(
                (style) => (
                  <label
                    key={style}
                    className="flex cursor-pointer items-center gap-3 rounded border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="style"
                      defaultChecked={style === "Friendly & Conversational"}
                      className="text-emerald-600"
                    />
                    <span className="text-sm text-gray-700">{style}</span>
                  </label>
                )
              )}
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700">Citation Mode</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Always cite source documents</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Show document names in responses</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Include page numbers</span>
              </label>
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700">Features</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Allow follow-up questions</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Suggest related SOPs</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Provide example scenarios</span>
              </label>
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700">Restrictions</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">
                  Only answer from knowledge base (no hallucination)
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Require login to use chatbot</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Log all conversations</span>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Save Changes
          </button>
          <button className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Reset to Default
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Test Your Chatbot</h3>
        <p className="mb-4 text-sm text-gray-600">
          Try asking a question to see how the chatbot responds with current settings.
        </p>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Ask a test question..."
            className="w-full rounded border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Test Query
          </button>
        </div>
      </div>
    </div>
  );
}
