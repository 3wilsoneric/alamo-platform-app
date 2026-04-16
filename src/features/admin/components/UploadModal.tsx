import { useState } from "react";
import { CheckCircle, FileText, Upload, X } from "lucide-react";

interface UploadModalProps {
  onClose: () => void;
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      setFile(event.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setUploaded(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="m-4 w-full max-w-2xl rounded-lg bg-white p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Upload New Document</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {uploaded ? (
          <div className="py-12 text-center">
            <CheckCircle size={64} className="mx-auto mb-4 text-green-600" />
            <h3 className="mb-2 text-xl font-semibold text-gray-900">Upload Successful!</h3>
            <p className="text-gray-600">Document is being indexed...</p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Document Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Incident Reporting Procedure"
                  className="w-full rounded border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select className="w-full rounded border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option>SOP</option>
                  <option>Policy</option>
                  <option>Procedure</option>
                  <option>Training</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tags (optional)
                </label>
                <input
                  type="text"
                  placeholder="incidents, reporting, compliance"
                  className="w-full rounded border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragActive ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-gray-50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText size={24} className="text-emerald-600" />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{file.name}</div>
                    <div className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="ml-4 text-red-600 hover:text-red-700"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="mb-2 font-medium text-gray-700">Drag and drop your file here</p>
                  <p className="mb-4 text-sm text-gray-500">or</p>
                  <label className="inline-block cursor-pointer rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    Browse Files
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="mt-4 text-xs text-gray-500">
                    Supports PDF, DOCX, TXT (max 10MB)
                  </p>
                </>
              )}
            </div>

            <div className="mt-6 space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Auto-index for chatbot</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">Extract tables and images</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded text-emerald-600" />
                <span className="text-sm text-gray-700">OCR for scanned documents</span>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1 rounded bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload & Index"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
