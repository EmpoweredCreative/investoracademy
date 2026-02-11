"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Upload, Download, CheckCircle, AlertTriangle, FileText } from "lucide-react";

interface Account {
  id: string;
  name: string;
}

interface PreviewRow {
  rowIndex: number;
  status: string;
  symbol: string;
  action: string;
  quantity: string;
  price: string;
  instrument_type: string;
  trade_datetime: string;
}

interface ImportSummary {
  new: number;
  duplicateFile: number;
  duplicateRef: number;
  duplicateFingerprint: number;
}

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) setSelectedAccount(data[0].id);
      });
  }, []);

  const handleUpload = async () => {
    if (!file || !selectedAccount) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", selectedAccount);

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      setImportId(data.importId);
      setPreview(data.preview);
      setSummary(data.summary);
      setUploading(false);
    } catch {
      setError("Upload failed");
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!importId) return;
    setCommitting(true);

    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Commit failed");
        setCommitting(false);
        return;
      }

      setCommitted(true);
      setCommitting(false);
    } catch {
      setError("Commit failed");
      setCommitting(false);
    }
  };

  const statusBadge = useCallback((status: string) => {
    switch (status) {
      case "NEW":
        return <Badge variant="success">NEW</Badge>;
      case "DUPLICATE_FILE":
        return <Badge variant="danger">DUP FILE</Badge>;
      case "DUPLICATE_EXTERNAL_REF":
        return <Badge variant="warning">DUP REF</Badge>;
      case "DUPLICATE_FINGERPRINT":
        return <Badge variant="warning">DUP FP</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">CSV Import</h1>
        <p className="text-muted text-sm mt-1">
          Import trades from CSV with 3-layer deduplication
        </p>
      </div>

      {committed ? (
        <Card className="text-center py-12">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
          <h2 className="text-xl font-bold">Import Committed</h2>
          <p className="text-muted mt-2">
            {summary?.new || 0} new records imported, {(summary?.duplicateFile || 0) + (summary?.duplicateRef || 0) + (summary?.duplicateFingerprint || 0)} duplicates skipped.
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setCommitted(false);
              setImportId(null);
              setPreview([]);
              setSummary(null);
              setFile(null);
            }}
          >
            Import Another File
          </Button>
        </Card>
      ) : !importId ? (
        <>
          {/* Template Download */}
          <Card>
            <CardHeader>
              <CardTitle>Download Template</CardTitle>
              <CardDescription>
                Use this CSV template to format your trade data for import.
              </CardDescription>
            </CardHeader>
            <a href="/api/import/template" download>
              <Button variant="secondary" size="sm">
                <Download className="w-4 h-4" />
                Download Template
              </Button>
            </a>
          </Card>

          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV</CardTitle>
              <CardDescription>
                Select an account and upload your trade CSV file.
              </CardDescription>
            </CardHeader>

            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Select
                label="Target Account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  CSV File
                </label>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    file ? "border-accent/50 bg-accent/5" : "border-border hover:border-muted"
                  }`}
                >
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-8 h-8 text-accent" />
                        <div className="text-left">
                          <p className="font-medium">{file.name}</p>
                          <p className="text-xs text-muted">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-muted mx-auto mb-3" />
                        <p className="text-sm text-muted">
                          Click to select or drag and drop your CSV file
                        </p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <Button
                onClick={handleUpload}
                loading={uploading}
                disabled={!file || !selectedAccount}
              >
                <Upload className="w-4 h-4" />
                Upload & Preview
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Preview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Import Preview</CardTitle>
                  <CardDescription>
                    Review the deduplicated results before committing.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCommit} loading={committing} disabled={summary?.new === 0}>
                    <CheckCircle className="w-4 h-4" />
                    Commit {summary?.new || 0} New
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setImportId(null);
                      setPreview([]);
                      setSummary(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="p-3 rounded-lg bg-success/5 border border-success/20 text-center">
                  <p className="text-xl font-bold text-success">{summary.new}</p>
                  <p className="text-xs text-muted">New</p>
                </div>
                <div className="p-3 rounded-lg bg-danger/5 border border-danger/20 text-center">
                  <p className="text-xl font-bold text-danger">{summary.duplicateFile}</p>
                  <p className="text-xs text-muted">Dup File</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-center">
                  <p className="text-xl font-bold text-warning">{summary.duplicateRef}</p>
                  <p className="text-xs text-muted">Dup Ref</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-center">
                  <p className="text-xl font-bold text-warning">{summary.duplicateFingerprint}</p>
                  <p className="text-xs text-muted">Dup FP</p>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-medium text-muted">#</th>
                    <th className="text-left p-2 font-medium text-muted">Status</th>
                    <th className="text-left p-2 font-medium text-muted">Symbol</th>
                    <th className="text-left p-2 font-medium text-muted">Type</th>
                    <th className="text-left p-2 font-medium text-muted">Action</th>
                    <th className="text-left p-2 font-medium text-muted">Qty</th>
                    <th className="text-left p-2 font-medium text-muted">Price</th>
                    <th className="text-left p-2 font-medium text-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={`border-b border-border/50 ${
                        row.status !== "NEW" ? "opacity-50" : ""
                      }`}
                    >
                      <td className="p-2 text-muted">{row.rowIndex + 1}</td>
                      <td className="p-2">{statusBadge(row.status)}</td>
                      <td className="p-2 font-medium">{row.symbol}</td>
                      <td className="p-2">{row.instrument_type}</td>
                      <td className="p-2">{row.action}</td>
                      <td className="p-2">{row.quantity}</td>
                      <td className="p-2">${row.price}</td>
                      <td className="p-2 text-muted">
                        {new Date(row.trade_datetime).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
