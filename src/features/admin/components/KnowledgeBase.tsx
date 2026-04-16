import { useState } from "react";
import {
  Eye,
  FileText,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload
} from "lucide-react";
import UploadModal from "./UploadModal";

interface DocumentRecord {
  id: number;
  title: string;
  category: "SOP" | "Policy" | "Procedure" | "Training";
  uploadedDate: string;
  chunks: number;
  status: "active" | "inactive" | "processing" | "failed";
  fileSize: string;
  uploadedBy: string;
}

const mockDocuments: DocumentRecord[] = [
  { id: 1, title: "Incident Reporting Procedure", category: "SOP", uploadedDate: "Jan 15, 2025", chunks: 234, status: "active", fileSize: "2.3 MB", uploadedBy: "Name" },
  { id: 2, title: "Medication Administration Policy", category: "Policy", uploadedDate: "Dec 20, 2024", chunks: 156, status: "active", fileSize: "1.8 MB", uploadedBy: "Maria Rodriguez" },
  { id: 3, title: "Staff Training Manual", category: "Training", uploadedDate: "Nov 10, 2024", chunks: 412, status: "active", fileSize: "5.1 MB", uploadedBy: "Jennifer Walsh" },
  { id: 4, title: "Emergency Response Protocol", category: "SOP", uploadedDate: "Jan 5, 2025", chunks: 189, status: "active", fileSize: "1.5 MB", uploadedBy: "Name" },
  { id: 5, title: "HIPAA Compliance Guidelines", category: "Policy", uploadedDate: "Dec 15, 2024", chunks: 278, status: "active", fileSize: "3.2 MB", uploadedBy: "Patricia Moore" },
  { id: 6, title: "Client Intake Procedures", category: "Procedure", uploadedDate: "Jan 8, 2025", chunks: 167, status: "inactive", fileSize: "1.2 MB", uploadedBy: "Robert Anderson" },
  { id: 7, title: "Discharge Planning Checklist", category: "Procedure", uploadedDate: "Dec 28, 2024", chunks: 98, status: "active", fileSize: "890 KB", uploadedBy: "Dr. Sarah Johnson" },
  { id: 8, title: "Crisis Intervention Training", category: "Training", uploadedDate: "Nov 22, 2024", chunks: 345, status: "active", fileSize: "4.5 MB", uploadedBy: "Emily Rodriguez" },
  { id: 9, title: "Medication Error Reporting", category: "SOP", uploadedDate: "Jan 12, 2025", chunks: 123, status: "processing", fileSize: "1.1 MB", uploadedBy: "Name" },
  { id: 10, title: "Fire Safety Procedures", category: "SOP", uploadedDate: "Dec 5, 2024", chunks: 145, status: "active", fileSize: "1.6 MB", uploadedBy: "Carlos Rodriguez" },
  { id: 11, title: "Behavioral Health Assessment Forms", category: "Procedure", uploadedDate: "Jan 18, 2025", chunks: 201, status: "active", fileSize: "2.1 MB", uploadedBy: "Dr. James Martinez" },
  { id: 12, title: "Staff Code of Conduct", category: "Policy", uploadedDate: "Nov 30, 2024", chunks: 134, status: "active", fileSize: "1.4 MB", uploadedBy: "Patricia Moore" }
];

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState<DocumentRecord[]>(mockDocuments);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleDocumentStatus = (id: number) => {
    setDocuments((items) =>
      items.map((doc) =>
        doc.id === id
          ? { ...doc, status: doc.status === "active" ? "inactive" : "active" }
          : doc
      )
    );
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory = selectedCategory === "all" || doc.category === selectedCategory;
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const activeCount = documents.filter((doc) => doc.status === "active").length;
  const totalChunks = documents.reduce(
    (sum, doc) => sum + (doc.status === "active" ? doc.chunks : 0),
    0
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-8">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-gray-600">
              Active Documents
            </div>
            <div className="text-2xl font-bold text-gray-900">{activeCount}</div>
          </div>
          <div className="h-12 w-px bg-gray-300" />
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-gray-600">
              Indexed Chunks
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalChunks.toLocaleString()}</div>
          </div>
          <div className="h-12 w-px bg-gray-300" />
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-gray-600">
              Storage Used
            </div>
            <div className="text-2xl font-bold text-gray-900">145 MB</div>
          </div>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <Upload size={16} />
          Upload Document
        </button>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          {["all", "SOP", "Policy", "Procedure", "Training"].map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? "bg-emerald-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {category === "all" ? "All" : category}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                Document
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                Uploaded
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-700">
                Chunks
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-700">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((doc) => (
              <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-emerald-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                      <div className="text-xs text-gray-500">
                        {doc.fileSize} • {doc.uploadedBy}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      doc.category === "SOP"
                        ? "bg-blue-100 text-blue-700"
                        : doc.category === "Policy"
                          ? "bg-purple-100 text-purple-700"
                          : doc.category === "Procedure"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {doc.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{doc.uploadedDate}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">{doc.chunks}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      doc.status === "active"
                        ? "bg-green-100 text-green-700"
                        : doc.status === "inactive"
                          ? "bg-gray-100 text-gray-700"
                          : doc.status === "processing"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                    }`}
                  >
                    {doc.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button className="rounded p-1.5 transition-colors hover:bg-gray-100" title="Preview">
                      <Eye size={16} className="text-gray-600" />
                    </button>
                    <button className="rounded p-1.5 transition-colors hover:bg-gray-100" title="Re-index">
                      <RefreshCw size={16} className="text-gray-600" />
                    </button>
                    <button
                      onClick={() => toggleDocumentStatus(doc.id)}
                      className="rounded p-1.5 transition-colors hover:bg-gray-100"
                      title={doc.status === "active" ? "Deactivate" : "Activate"}
                    >
                      {doc.status === "active" ? (
                        <ToggleRight size={16} className="text-emerald-600" />
                      ) : (
                        <ToggleLeft size={16} className="text-gray-400" />
                      )}
                    </button>
                    <button className="rounded p-1.5 transition-colors hover:bg-gray-100" title="Delete">
                      <Trash2 size={16} className="text-red-600" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} />}
    </>
  );
}
