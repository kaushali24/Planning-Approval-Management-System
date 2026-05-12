import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, FileText, Send, Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { API_BASE_URL } from '../../utils/apiBase.js';
import {
  appendAppealVersion,
  getLatestAppeal,
  inferAppealRoute,
} from '../../data/appealWorkflowStore';
import { formatDateTime } from '../../utils/locale';
import { getDisplayApplicationCode } from '../../utils/applicationCode';

const API_BASE = `${API_BASE_URL}/api`;
const MAX_APPEAL_DOCUMENT_LABEL_LENGTH = 120;

const APPEAL_STATUSES = {
  submitted: { tone: 'warning', label: 'Submitted' },
  'under-review': { tone: 'info', label: 'Under Review' },
  'routed-to-to': { tone: 'info', label: 'Routed to Technical Officer' },
  'routed-to-sw': { tone: 'info', label: 'Routed to Superintendent' },
  'forwarded-to-committee': { tone: 'info', label: 'Forwarded to Committee' },
  resolved: { tone: 'success', label: 'Resolved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  'resubmit-required': { tone: 'warning', label: 'Resubmit Required' },
};

const statusMeta = (status) => APPEAL_STATUSES[status] || { tone: 'pending', label: status || 'Pending' };

const AppealsPage = () => {
  const { token } = useAuth();
  const { success, error } = useNotifications();

  const [appeals, setAppeals] = useState({});
  const [liveEligibleApplications, setLiveEligibleApplications] = useState([]);
  const [selectedAppealApplicationId, setSelectedAppealApplicationId] = useState('');
  const [form, setForm] = useState({
    applicationId: '',
    summary: '',
    correctionsCategory: 'documents',
    specialCircumstances: '',
    containsNewPlans: false,
  });
  const [correctedDocuments, setCorrectedDocuments] = useState([]);
  const [additionalDocuments, setAdditionalDocuments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFilesSelected = useCallback((kind, files) => {
    const mapped = Array.from(files || []).map((file) => ({
      file,
      label: file.name,
      kind,
    }));
    if (kind === 'corrected') {
      setCorrectedDocuments(mapped);
      return;
    }
    setAdditionalDocuments(mapped);
  }, []);

  const removeDocumentAt = useCallback((kind, index) => {
    if (kind === 'corrected') {
      setCorrectedDocuments((prev) => prev.filter((_, idx) => idx !== index));
      return;
    }
    setAdditionalDocuments((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const updateDocumentLabel = useCallback((kind, index, label) => {
    if (kind === 'corrected') {
      setCorrectedDocuments((prev) => prev.map((doc, idx) => (idx === index ? { ...doc, label } : doc)));
      return;
    }
    setAdditionalDocuments((prev) => prev.map((doc, idx) => (idx === index ? { ...doc, label } : doc)));
  }, []);

  const fetchAuthedJson = useCallback(async (url, options = {}) => {
    if (!token) {
      throw new Error('Authentication token is missing');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || payload?.message || 'Request failed');
    }

    return payload;
  }, [token]);

  const loadLiveAppealData = useCallback(async () => {
    if (!token) return;

    try {
      const [applicationsPayload, appealsPayload] = await Promise.all([
        fetchAuthedJson(`${API_BASE}/applications?limit=100&sort=submission_date:DESC`),
        fetchAuthedJson(`${API_BASE}/appeals?limit=100`),
      ]);

      const eligibleStatuses = new Set(['not_granted_appeal_required']);
      const mappedApplications = (applicationsPayload.applications || [])
        .filter((application) => eligibleStatuses.has(application.status))
        .map((application) => ({
          dbId: application.id,
          id: application.application_code || `PENDING-${application.id}`,
          code: getDisplayApplicationCode(application.application_code),
          type: application.application_type === 'subdivision' ? 'Land Subdivision' : 'Building Permit',
          status: application.status,
        }));

      const details = await Promise.all(
        (appealsPayload.appealCases || []).map(async (appealCase) => {
          try {
            const detail = await fetchAuthedJson(`${API_BASE}/appeals/${appealCase.id}`);
            return detail;
          } catch {
            return null;
          }
        })
      );

      const applicationByDbId = new Map(mappedApplications.map((application) => [Number(application.dbId), application]));
      const mappedAppeals = {};

      for (const detail of details.filter(Boolean)) {
        const applicationMeta = applicationByDbId.get(Number(detail.application_id));
        if (!applicationMeta) continue;

        const latestVersion = Array.isArray(detail.versions) && detail.versions.length > 0 ? detail.versions[0] : null;
        const documentsByVersion = new Map();
        for (const doc of (detail.documents || [])) {
          const versionId = Number(doc.appeal_version_id);
          if (!documentsByVersion.has(versionId)) {
            documentsByVersion.set(versionId, []);
          }
          documentsByVersion.get(versionId).push({
            id: doc.id,
            label: doc.label || 'Appeal document',
            kind: doc.kind || 'additional',
            fileUrl: doc.document_id ? `${API_BASE}/documents/${doc.document_id}/download` : null,
          });
        }

        mappedAppeals[applicationMeta.id] = {
          applicationCode: applicationMeta.code,
          status: detail.status || 'submitted',
          route: detail.route || 'committee',
          submittedAt: detail.updated_at || detail.created_at || null,
          summary: latestVersion?.summary || '',
          type: applicationMeta.type,
          appealCaseId: detail.id,
          applicationDbId: detail.application_id,
          history: (detail.versions || []).map((version) => ({
            appealNo: version.appeal_no,
            versionId: version.id,
            submittedAt: version.created_at || null,
            summary: version.summary || '',
            route: detail.route || 'committee',
            documents: documentsByVersion.get(Number(version.id)) || [],
          })),
        };
      }

      setLiveEligibleApplications(mappedApplications);
      setAppeals(mappedAppeals);
    } catch (loadError) {
      error(`${loadError.message || 'Live API unavailable'}. Appeals data could not be refreshed.`);
      setAppeals({});
      setLiveEligibleApplications([]);
    }
  }, [token, fetchAuthedJson, error]);

  useEffect(() => {
    if (token) {
      loadLiveAppealData();
      return undefined;
    }

    setAppeals({});
    return undefined;
  }, [token, loadLiveAppealData]);

  const eligibleApplications = useMemo(() => liveEligibleApplications, [liveEligibleApplications]);

  const appealRows = useMemo(() => {
    return Object.entries(appeals)
      .map(([applicationId, appeal]) => {
        const latest = getLatestAppeal(appeal);
        return {
          applicationId,
          applicationCode: appeal?.applicationCode || applicationId,
          type: appeal?.type || 'Building Permit',
          status: appeal?.status || 'submitted',
          route: appeal?.route || latest?.route || 'committee',
          submittedAt: latest?.submittedAt || appeal?.submittedAt || null,
          latestSummary: latest?.summary || appeal?.summary || '',
          versions: Array.isArray(appeal?.history) ? appeal.history.length : 0,
        };
      })
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  }, [appeals]);

  const selectedAppeal = useMemo(() => {
    if (!selectedAppealApplicationId) return null;
    const appeal = appeals[selectedAppealApplicationId];
    if (!appeal) return null;
    return {
      applicationId: selectedAppealApplicationId,
      applicationCode: appeal.applicationCode || selectedAppealApplicationId,
      ...appeal,
      history: Array.isArray(appeal.history) ? appeal.history : [],
    };
  }, [appeals, selectedAppealApplicationId]);

  const handleSubmit = async () => {
    const applicationId = String(form.applicationId || '').trim();
    const summary = String(form.summary || '').trim();

    if (!applicationId) {
      error('Select an application before submitting an appeal.');
      return;
    }

    if (summary.length < 20) {
      error('Appeal summary must include at least 20 characters.');
      return;
    }

    const route = inferAppealRoute({
      summary,
      correctionsCategory: form.correctionsCategory,
      correctedDocuments: [],
      additionalDocuments: [],
    });

    const selectedApplication = eligibleApplications.find((item) => item.id === applicationId);
    const existing = appeals[applicationId] || null;

    const selectedCorrectedDocuments = correctedDocuments;
    const selectedAdditionalDocuments = additionalDocuments;
    const documentSelection = [...selectedCorrectedDocuments, ...selectedAdditionalDocuments];

    if (!existing && documentSelection.length === 0) {
      error('Attach at least one corrected or additional document before submitting.');
      return;
    }

    const invalidLabel = documentSelection.find((doc) => {
      const trimmedLabel = String(doc.label || '').trim();
      return !trimmedLabel || trimmedLabel.length > MAX_APPEAL_DOCUMENT_LABEL_LENGTH;
    });
    if (invalidLabel) {
      error(`Each document label is required and must be <= ${MAX_APPEAL_DOCUMENT_LABEL_LENGTH} characters.`);
      return;
    }

    const uploadAppealDocuments = async () => {
      const uploadedDocuments = [];
      for (const document of documentSelection) {
        const formData = new FormData();
        formData.append('application_id', String(selectedApplication.dbId));
        formData.append('doc_type', `appeal_${document.kind}`);
        formData.append('file', document.file);

        const response = await fetch(`${API_BASE}/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || 'Failed to upload appeal document');
        }

        uploadedDocuments.push({
          document_id: payload?.document?.id || null,
          label: String(document.label || '').trim(),
          kind: document.kind,
        });
      }
      return uploadedDocuments;
    };

    if (token && selectedApplication?.dbId) {
      setIsSubmitting(true);
      try {
        const uploadedDocuments = await uploadAppealDocuments();
        if (existing?.appealCaseId) {
          await fetchAuthedJson(`${API_BASE}/appeals/${existing.appealCaseId}/versions`, {
            method: 'POST',
            body: JSON.stringify({
              summary,
              corrections_category: form.correctionsCategory,
              special_circumstances: form.specialCircumstances,
              contains_new_plans: form.containsNewPlans,
              documents: uploadedDocuments,
            }),
          });
        } else {
          await fetchAuthedJson(`${API_BASE}/appeals`, {
            method: 'POST',
            body: JSON.stringify({
              application_id: Number(selectedApplication.dbId),
              route,
              summary,
              corrections_category: form.correctionsCategory,
              special_circumstances: form.specialCircumstances,
              contains_new_plans: form.containsNewPlans,
              documents: uploadedDocuments,
            }),
          });
        }
      } catch (submitError) {
        error(submitError.message || 'Failed to submit appeal.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    }

    const nextEntry = appendAppealVersion(existing, {
      type: selectedApplication?.type || 'Building Permit',
      status: 'forwarded-to-committee',
      route,
      summary,
      correctionsCategory: form.correctionsCategory,
      specialCircumstances: form.specialCircumstances,
      containsNewPlans: form.containsNewPlans,
      submittedAt: new Date().toISOString(),
      acknowledgements: {
        addressedAll: true,
        understandsWorkflow: true,
      },
      correctedDocuments: [],
      additionalDocuments: [],
      requiredActions: ['Committee review pending'],
    });

    const nextAppeals = {
      ...appeals,
      [applicationId]: nextEntry,
    };

    setAppeals(nextAppeals);
    setForm({
      applicationId: '',
      summary: '',
      correctionsCategory: 'documents',
      specialCircumstances: '',
      containsNewPlans: false,
    });
    setCorrectedDocuments([]);
    setAdditionalDocuments([]);

    success(`Appeal submission saved for ${applicationId}.`);

    if (token) {
      loadLiveAppealData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appeals</h1>
          <p className="text-sm text-slate-500">Submit and track applicant appeals for decisions requiring reconsideration.</p>
        </div>
        <Link to="/applications">
          <Button variant="secondary">Open Applications</Button>
        </Link>
      </div>

      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Submit New Appeal</h2>
        </div>

        {eligibleApplications.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            No applications currently require an appeal.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Application</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.applicationId}
                  onChange={(event) => setForm((prev) => ({ ...prev, applicationId: event.target.value }))}
                >
                  <option value="">Select application</option>
                  {eligibleApplications.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} ({item.type})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Correction Category</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.correctionsCategory}
                  onChange={(event) => setForm((prev) => ({ ...prev, correctionsCategory: event.target.value }))}
                >
                  <option value="documents">Documents</option>
                  <option value="plans">Plans</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-sm font-medium text-slate-700">Appeal Summary</span>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-24"
                placeholder="Explain what was corrected and why this appeal should be approved."
                value={form.summary}
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-sm font-medium text-slate-700">Special Circumstances (Optional)</span>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-20"
                placeholder="Add relevant context or constraints for committee review."
                value={form.specialCircumstances}
                onChange={(event) => setForm((prev) => ({ ...prev, specialCircumstances: event.target.value }))}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={form.containsNewPlans}
                onChange={(event) => setForm((prev) => ({ ...prev, containsNewPlans: event.target.checked }))}
              />
              Includes new plans or architectural drawings
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700">Corrected Documents</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => handleFilesSelected('corrected', event.target.files)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500">Upload corrected versions required by the review team.</p>
              </label>
              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700">Additional Documents</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => handleFilesSelected('additional', event.target.files)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500">Upload new supporting evidence or clarifications.</p>
              </label>
            </div>

            {(correctedDocuments.length > 0 || additionalDocuments.length > 0) && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700 inline-flex items-center gap-1">
                  <Upload className="w-4 h-4" /> Attached Appeal Documents
                </p>
                {correctedDocuments.map((doc, idx) => (
                  <div key={`corrected-${doc.file.name}-${idx}`} className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-2">
                    <div>
                      <p className="text-sm text-slate-800">{doc.label}</p>
                      <p className="text-xs text-slate-500">Corrected · {(doc.file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={doc.label}
                        onChange={(event) => updateDocumentLabel('corrected', idx, event.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Document label"
                        maxLength={MAX_APPEAL_DOCUMENT_LABEL_LENGTH}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeDocumentAt('corrected', idx)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${doc.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {additionalDocuments.map((doc, idx) => (
                  <div key={`additional-${doc.file.name}-${idx}`} className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-2">
                    <div>
                      <p className="text-sm text-slate-800">{doc.label}</p>
                      <p className="text-xs text-slate-500">Additional · {(doc.file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={doc.label}
                        onChange={(event) => updateDocumentLabel('additional', idx, event.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Document label"
                        maxLength={MAX_APPEAL_DOCUMENT_LABEL_LENGTH}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeDocumentAt('additional', idx)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${doc.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting Appeal...' : 'Submit Appeal'}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Appeal History</h2>
        </div>

        {appealRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No appeals submitted yet.
          </div>
        ) : (
          <div className="space-y-3">
            {appealRows.map((row) => {
              const meta = statusMeta(row.status);
              return (
                <button
                  key={row.applicationId}
                  type="button"
                  onClick={() => setSelectedAppealApplicationId(row.applicationId)}
                  className="w-full text-left rounded-xl border border-slate-200 p-4 flex flex-col gap-2 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{row.applicationCode}</p>
                      <p className="text-xs text-slate-500">{row.type} · Route: {row.route}</p>
                    </div>
                    <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
                  </div>
                  <p className="text-sm text-slate-700">{row.latestSummary || 'No summary provided.'}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Versions: {row.versions}</span>
                    <span>Last Submitted: {row.submittedAt ? formatDateTime(row.submittedAt) : 'N/A'}</span>
                    <span className="text-blue-700">Click to view details</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </section>

      {selectedAppeal && (
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Appeal Detail</h2>
              <p className="text-sm text-slate-500">{selectedAppeal.applicationCode}</p>
            </div>
            <Button variant="secondary" onClick={() => setSelectedAppealApplicationId('')}>
              Close
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Status</p>
              <p className="font-semibold text-slate-800">{statusMeta(selectedAppeal.status).label}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Route</p>
              <p className="font-semibold text-slate-800">{selectedAppeal.route || 'committee'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-slate-500">Last Updated</p>
              <p className="font-semibold text-slate-800">
                {selectedAppeal.submittedAt ? formatDateTime(selectedAppeal.submittedAt) : 'N/A'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Version History</p>
            {selectedAppeal.history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No versions recorded.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedAppeal.history.map((version) => (
                  <div key={version.appealNo} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Appeal #{version.appealNo}</p>
                      <p className="text-xs text-slate-500">
                        {version.submittedAt ? formatDateTime(version.submittedAt) : 'N/A'}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{version.summary || 'No summary provided.'}</p>
                    {Array.isArray(version.documents) && version.documents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-slate-600">Documents</p>
                        {version.documents.map((doc) => (
                          <div key={doc.id} className="text-xs flex items-center justify-between rounded bg-slate-50 border border-slate-200 px-2 py-1.5">
                            <span className="text-slate-700">{doc.label} ({doc.kind})</span>
                            {doc.fileUrl ? (
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-slate-400">Unavailable</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default AppealsPage;
