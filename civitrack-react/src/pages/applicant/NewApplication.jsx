import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import Step1_TypeSelection from '../../components/forms/Step1_TypeSelection.jsx';
import Step2_Details from '../../components/forms/Step2_Details.jsx';
import Step3_Uploads from '../../components/forms/Step3_Uploads.jsx';
import Step4_ProjectDetails from '../../components/forms/Step4_ProjectDetails.jsx';
import Step5_LocationMap from '../../components/forms/Step5_LocationMap.jsx';
import Step6_ReviewSubmit from '../../components/forms/Step6_ReviewSubmit.jsx';
import { ChevronLeft, ChevronRight, CheckCircle2, Download, Copy } from 'lucide-react';
import { formatTime } from '../../utils/locale';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { downloadApplicationAsHTML, downloadApplicationAsPDF } from '../../utils/applicationDownload.js';
import { getRequiredDocumentsByType, queuePlanningSubmission } from '../../data/planningWorkflowStore';
import { forceRefreshDocumentChecklistConfig } from '../../utils/documentChecklistConfig.js';
import { formatApplicationCode } from '../../utils/applicationCode';

const API_BASE = 'http://localhost:5000/api';
const DEFAULT_APPLICATION_FEES = {
  building_permit: 750,
  land_subdivision: 500,
};

const buildFallbackApplicationCode = (id, applicationType) => {
  const prefix = String(applicationType || '').toLowerCase() === 'subdivision' ? 'SV' : 'BD';
  return `${prefix}/${new Date().getFullYear()}/${String(id || '').padStart(5, '0')}`;
};

const defaultFormData = {
  selectedPermitTypes: ['building'],
  applicationType: 'building',
  guidelinesAcknowledged: false,
  applicationFeePaid: false,
  applicationFeeMethod: '',
  applicationFeeReceiptRef: '',
  applicationFeeTransactionId: '',
  applicationFeePaidAt: '',
  paymentCardNumber: '',
  paymentExpiry: '',
  paymentCvv: '',
  paymentCardHolder: '',
  applicantName: '',
  nicNumber: '',
  applicantAddress: '',
  contactNumber: '',
  email: '',
  assessmentNumber: '',
  deedNumber: '',
  surveyPlan: '',
  landExtent: '',
  documents: {},
  documentCustomNames: {},
  buildingNature: '',
  buildingUse: '',
  existingBuildings: '',
  roadWidth: '',
  boundaryNorth: '',
  boundarySouth: '',
  boundaryEast: '',
  boundaryWest: '',
  numberOfFloors: '',
  totalFloorArea: '',
  frontSetback: '',
  rearSetback: '',
  sideSetback1: '',
  sideSetback2: '',
  waterSource: '',
  wastewaterMethod: '',
  constructionCost: '',
  wallLength: '',
  wallHeight: '',
  wallMaterials: '',
  subdivisionNature: '',
  subdivisionUse: '',
  numberOfLots: '',
  smallestLotExtent: '',
  latitude: null,
  longitude: null,
  declaration: false,
};

const loadSavedDraftState = () => {
  if (typeof window === 'undefined') {
    return { formData: defaultFormData, currentStep: 1, lastSaved: null };
  }

  const saved = window.localStorage.getItem('applicationDraft');
  if (!saved) {
    return { formData: defaultFormData, currentStep: 1, lastSaved: null };
  }

  try {
    const draft = JSON.parse(saved);
    const restored = { ...defaultFormData, ...(draft.formData || {}) };

    // Restore document stubs — these are metadata-only (Files can't survive localStorage)
    if (restored.documents && typeof restored.documents === 'object') {
      const restoredDocs = {};
      for (const [docId, files] of Object.entries(restored.documents)) {
        if (Array.isArray(files) && files.length > 0) {
          restoredDocs[docId] = files.map((f) => ({
            name: f.name || 'Unknown file',
            size: f.size || 0,
            type: f.type || 'application/octet-stream',
            fileUrl: f.fileUrl || '',
            _isPersistedUpload: f._isPersistedUpload === true,
            _isDraftStub: f._isPersistedUpload === true ? false : true,
          }));
        }
      }
      restored.documents = restoredDocs;
    }

    return {
      formData: restored,
      currentStep: draft.currentStep ?? 1,
      lastSaved: draft.savedAt ? new Date(draft.savedAt) : null,
    };
  } catch (error) {
    console.error('Failed to load draft', error);
    return { formData: defaultFormData, currentStep: 1, lastSaved: null };
  }
};


const getInitialRegularizationState = () => {
  if (typeof window === 'undefined') {
    return { regularizationContext: null, showWizard: false, enabled: false };
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('type') !== 'regularization') {
    return { regularizationContext: null, showWizard: false, enabled: false };
  }

  return {
    regularizationContext: {
      cocViolationRef: params.get('cocViolationRef') || '',
      originalApplicationId: params.get('originalApplicationId') || '',
    },
    showWizard: true,
    enabled: true,
  };
};

const NewApplication = () => {
  const { success, error, info } = useNotifications();
  const { token } = useAuth() || {};
  const initialRegularizationState = getInitialRegularizationState();
  const initialDraftState = loadSavedDraftState();
  const initialFormData = initialRegularizationState.enabled
    ? { ...initialDraftState.formData, applicationType: 'building' }
    : initialDraftState.formData;
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('resume');
  const [showWizard, setShowWizard] = useState(initialRegularizationState.showWizard || !!resumeId);
  const [regularizationContext] = useState(initialRegularizationState.regularizationContext);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(initialDraftState.currentStep);
  const [lastSaved, setLastSaved] = useState(initialDraftState.lastSaved);
  const [validationErrors, setValidationErrors] = useState({});
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [feeConfig, setFeeConfig] = useState(DEFAULT_APPLICATION_FEES);
  const [checklistVersion, setChecklistVersion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResubmitMode, setIsResubmitMode] = useState(false);
  const fetchAttemptedRef = useRef(null);
  const hydratedDocsForDbIdRef = useRef(null);
  const [lastFetchedResumeId, setLastFetchedResumeId] = useState(null);

  const isBrowserFileObject = (file) => typeof File !== 'undefined' && file instanceof File;
  const isUsableDocumentFile = (file) => Boolean(file) && (file._isPersistedUpload === true || isBrowserFileObject(file));

  const fetchApplicationForResubmit = useCallback(async (appId) => {
    if (!token || !appId || appId === lastFetchedResumeId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/applications/${appId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch application for resubmission');

      const project = data.project_details || {};
      
      setFormData(prev => ({
        ...prev,
        dbId: data.id,
        applicationType: data.application_type,
        selectedPermitTypes: Array.isArray(data.selected_permit_codes) ? data.selected_permit_codes : [],
        applicantName: data.submitted_applicant_name,
        nicNumber: data.submitted_nic_number,
        applicantAddress: data.submitted_address,
        contactNumber: data.submitted_contact,
        email: data.submitted_email,
        assessmentNumber: data.assessment_number,
        deedNumber: data.deed_number,
        surveyPlan: data.survey_plan_ref,
        landExtent: data.land_extent,
        latitude: data.latitude,
        longitude: data.longitude,
        // Project details mapping
        buildingNature: project.buildingNature || '',
        buildingUse: project.buildingUse || '',
        existingBuildings: project.existingBuildings || '',
        roadWidth: project.roadWidth || '',
        numberOfFloors: project.numberOfFloors || '',
        totalFloorArea: project.totalFloorArea || '',
        frontSetback: project.frontSetback || '',
        rearSetback: project.rearSetback || '',
        sideSetback1: project.sideSetback1 || '',
        sideSetback2: project.sideSetback2 || '',
        waterSource: project.waterSource || '',
        wastewaterMethod: project.wastewaterMethod || '',
        constructionCost: project.constructionCost || '',
        wallLength: project.wallLength || '',
        wallHeight: project.wallHeight || '',
        wallMaterials: project.wallMaterials || '',
      }));
      
      setIsResubmitMode(true);
      setLastFetchedResumeId(appId);
      setShowWizard(true);
      info(`Correction mode: Resubmitting application ${data.application_code || appId}. Please update the flagged sections.`);
    } finally {
      setIsLoading(false);
    }
  }, [token, error, info]);

  useEffect(() => {
     if (resumeId && fetchAttemptedRef.current !== resumeId && !isLoading) {
       fetchAttemptedRef.current = resumeId;
       fetchApplicationForResubmit(resumeId);
     }
  }, [resumeId, isLoading, fetchApplicationForResubmit]);

  useEffect(() => {
    if (initialRegularizationState.enabled) {
      info('Regularization mode enabled. Submit as-built building details and documents for review.');
    }
  }, [initialRegularizationState.enabled, info]);

  useEffect(() => {
    if (!showWizard) return;

    forceRefreshDocumentChecklistConfig()
      .then(() => setChecklistVersion((prev) => prev + 1))
      .catch(() => {
        // Keep existing cached/default checklist if refresh fails.
      });
  }, [showWizard]);

  const loadFeeConfiguration = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/config/fees`);
      const payload = await response.json();
      if (!response.ok) {
        return;
      }

      const rows = Array.isArray(payload.fees) ? payload.fees : [];
      const nextFees = rows.reduce((acc, row) => {
        acc[row.fee_type] = Number(row.amount || 0);
        return acc;
      }, { ...DEFAULT_APPLICATION_FEES });

      setFeeConfig(nextFees);
    } catch (_err) {
      // Keep defaults if fee config cannot be loaded.
    }
  }, []);

  useEffect(() => {
    loadFeeConfiguration();
  }, [loadFeeConfiguration]);

  useEffect(() => {
    if (showWizard) {
      loadFeeConfiguration();
    }
  }, [showWizard, loadFeeConfiguration]);

  useEffect(() => {
    const hydratePersistedDraftDocuments = async () => {
      if (!showWizard || !token || !formData.dbId || isResubmitMode) return;
      if (hydratedDocsForDbIdRef.current === formData.dbId) return;

      try {
        const response = await fetch(`${API_BASE}/applications/${formData.dbId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) return;

        const normalizeDocKey = (value) =>
          String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

        const backendDocuments = Array.isArray(payload.documents) ? payload.documents : [];
        const requiredDocIds = getRequiredDocumentIds(formData.selectedPermitTypes || formData.applicationType);
        const persistedByDocId = {};

        for (const docId of requiredDocIds) {
          const match = backendDocuments.find((doc) => {
            const normalizedType = normalizeDocKey(doc.doc_type);
            const normalizedCategory = normalizeDocKey(doc.document_category);
            return normalizedType === docId || normalizedCategory === docId;
          });
          if (!match) continue;

          persistedByDocId[docId] = [{
            name: match.original_filename || match.stored_filename || `${docId}.file`,
            size: Number(match.file_size) || 0,
            type: match.mime_type || 'application/octet-stream',
            fileUrl: match.file_url || '',
            _isPersistedUpload: true,
            _isDraftStub: false,
          }];
        }

        if (Object.keys(persistedByDocId).length > 0) {
          setFormData((prev) => {
            const nextDocuments = { ...(prev.documents || {}) };
            for (const [docId, persistedFiles] of Object.entries(persistedByDocId)) {
              const currentFiles = nextDocuments[docId] || [];
              const hasUserSelectedFile = Array.isArray(currentFiles) && currentFiles.some((file) => isBrowserFileObject(file));
              if (!hasUserSelectedFile) {
                nextDocuments[docId] = persistedFiles;
              }
            }
            return { ...prev, documents: nextDocuments };
          });
        }

        hydratedDocsForDbIdRef.current = formData.dbId;
      } catch {
        // Keep local draft values if hydration fails.
      }
    };

    hydratePersistedDraftDocuments();
  }, [showWizard, token, formData.dbId, formData.selectedPermitTypes, formData.applicationType, isResubmitMode]);

  const formatFeeLabel = (amount) => `LKR ${Number(amount || 0).toFixed(2)}`;

  const saveDraft = (stepOverride) => {
    // Convert File objects to serializable metadata before saving
    const serializableFormData = { ...formData };
    if (serializableFormData.documents && typeof serializableFormData.documents === 'object') {
      const serializedDocs = {};
      for (const [docId, files] of Object.entries(serializableFormData.documents)) {
        if (Array.isArray(files)) {
          serializedDocs[docId] = files.map((f) => ({
            name: f.name || 'Unknown file',
            size: f.size || 0,
            type: f.type || 'application/octet-stream',
            fileUrl: f.fileUrl || '',
            _isPersistedUpload: f._isPersistedUpload === true,
          }));
        }
      }
      serializableFormData.documents = serializedDocs;
    }

    const draft = {
      formData: serializableFormData,
      currentStep: stepOverride ?? currentStep,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('applicationDraft', JSON.stringify(draft));
    setLastSaved(new Date(draft.savedAt));
  };

  const clearDraft = () => {
    localStorage.removeItem('applicationDraft');
    setLastSaved(null);
    setFormData(defaultFormData);
    setCurrentStep(1);
    setValidationErrors({});
    info('Application draft cleared.');
  };

  const syncDraftToBackend = async (dataToSync) => {
    if (!token || isResubmitMode) return;
    
    // Step 2 info is required for backend records due to NOT NULL constraints
    if (!dataToSync.applicantName || !dataToSync.nicNumber || !dataToSync.email) return;

    try {
      const selectedPermitCodes = (dataToSync.selectedPermitTypes || [])
        .map((permitType) => (permitType === 'boundaryWall' ? 'boundary_wall' : permitType))
        .filter(Boolean);

      const payload = {
        application_type: dataToSync.applicationType || 'building',
        submitted_applicant_name: dataToSync.applicantName,
        submitted_nic_number: dataToSync.nicNumber,
        submitted_email: dataToSync.email,
        submitted_address: dataToSync.applicantAddress,
        submitted_contact: dataToSync.contactNumber,
        selected_permit_codes: selectedPermitCodes,
        assessment_number: dataToSync.assessmentNumber || '',
        deed_number: dataToSync.deedNumber || '',
        survey_plan_ref: dataToSync.surveyPlan || '',
        land_extent: dataToSync.landExtent || '',
        project_details: {
          wallLength: dataToSync.wallLength || '',
          wallHeight: dataToSync.wallHeight || '',
          wallMaterials: dataToSync.wallMaterials || '',
        },
        status: 'draft',
      };

      if (dataToSync.dbId) {
        await fetch(`${API_BASE}/applications/${dataToSync.dbId}/draft`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        const response = await fetch(`${API_BASE}/applications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.application?.id) {
            setFormData(prev => ({ ...prev, dbId: result.application.id }));
          }
        }
      }
    } catch (err) {
      console.warn('Silent draft sync failed:', err);
    }
  };

  const persistDraftDocumentsIfNeeded = useCallback(async () => {
    if (!token || !formData.dbId || isResubmitMode) return;

    const pendingUploads = Object.entries(formData.documents || {})
      .flatMap(([docType, files]) =>
        (Array.isArray(files) ? files : [])
          .filter((file) => isBrowserFileObject(file))
          .map((file) => ({ docType, file }))
      );

    if (pendingUploads.length === 0) return;

    const payload = new FormData();
    pendingUploads.forEach(({ docType, file }) => {
      payload.append('files', file);
      payload.append('doc_types', docType);
    });

    const response = await fetch(`${API_BASE}/applications/${formData.dbId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to persist draft documents');
    }

    const uploadedDocs = Array.isArray(data.documents) ? data.documents : [];
    if (uploadedDocs.length === 0) return;

    const normalizeDocKey = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const uploadedByDocId = uploadedDocs.reduce((acc, doc) => {
      const key = normalizeDocKey(doc.doc_type);
      if (!key) return acc;
      acc[key] = {
        name: doc.original_filename || doc.stored_filename || `${key}.file`,
        size: Number(doc.file_size) || 0,
        type: doc.mime_type || 'application/octet-stream',
        fileUrl: doc.file_url || '',
        _isPersistedUpload: true,
        _isDraftStub: false,
      };
      return acc;
    }, {});

    setFormData((prev) => {
      const nextDocuments = { ...(prev.documents || {}) };
      for (const [docId, persistedDoc] of Object.entries(uploadedByDocId)) {
        nextDocuments[docId] = [persistedDoc];
      }
      return { ...prev, documents: nextDocuments };
    });
  }, [token, formData.dbId, formData.documents, isResubmitMode]);

  const steps = [
    { number: 1, label: 'Permit Type', component: Step1_TypeSelection },
    { number: 2, label: 'Applicant Info', component: Step2_Details },
    { number: 3, label: 'Documents', component: Step3_Uploads },
    { number: 4, label: 'Project Details', component: Step4_ProjectDetails },
    { number: 5, label: 'Site Location', component: Step5_LocationMap },
    { number: 6, label: 'Review & Submit', component: Step6_ReviewSubmit }
  ];

  const getRequiredDocumentIds = (applicationType) => {
    const selectedPermitTypes = Array.isArray(applicationType)
      ? applicationType
      : formData.selectedPermitTypes || [];
    return getRequiredDocumentsByType(selectedPermitTypes)
      .filter((doc) => doc.required !== false)
      .map((doc) => doc.id);
  };

  const handleFormUpdate = (updates) => {
    setFormData((prev) => {
      const next = { ...prev, ...updates };
      const selectedPermitTypes = Array.isArray(next.selectedPermitTypes) ? next.selectedPermitTypes : [];

      if (selectedPermitTypes.length === 0) {
        next.applicationType = null;
      } else if (selectedPermitTypes.includes('subdivision')) {
        next.applicationType = 'subdivision';
      } else if (selectedPermitTypes.includes('building') || selectedPermitTypes.includes('boundaryWall')) {
        next.applicationType = 'building';
      }

      return next;
    });
  };

  const handleNext = async () => {
    const validateStep = (step) => {
      const errors = {};
      if (step === 1) {
        if (!formData.selectedPermitTypes?.length) {
          errors.applicationType = 'Please select at least one permit type';
        }
        if (!formData.guidelinesAcknowledged) {
          errors.guidelinesAcknowledged = 'Please confirm that you reviewed the guidelines before continuing';
        }
      }
      if (step === 2) {
        const requiredFields = {
          applicantName: 'Full name is required',
          nicNumber: 'NIC number is required',
          applicantAddress: 'Address is required',
          contactNumber: 'Contact number is required',
          email: 'Email is required',
          assessmentNumber: 'Assessment number is required',
          deedNumber: 'Deed number is required',
          surveyPlan: 'Survey plan details are required',
          landExtent: 'Land extent is required',
        };
        Object.entries(requiredFields).forEach(([key, message]) => {
          if (!formData[key]) errors[key] = message;
        });
      }
      if (step === 3) {
        const requiredDocumentIds = getRequiredDocumentIds(formData.selectedPermitTypes || formData.applicationType);
        const hasRealFile = (docId) => {
          const files = formData.documents?.[docId];
          return Array.isArray(files) && files.length > 0 && files.some((f) => isUsableDocumentFile(f));
        };
        const missingDocuments = requiredDocumentIds.filter((docId) => !hasRealFile(docId));

        if (missingDocuments.length > 0) {
          errors.documents = 'Please upload all required documents before continuing.';
          errors.missingDocuments = missingDocuments;
        }
      }
      if (step === 6) {
        const requiresPayment = (formData.selectedPermitTypes || []).length > 0;
        if (requiresPayment && !formData.applicationFeeMethod) {
          errors.applicationFeeMethod = 'Please select a payment method';
        }
        if (requiresPayment && formData.applicationFeeMethod === 'bank' && !formData.applicationFeeReceiptRef?.trim()) {
          errors.applicationFeeReceiptRef = 'Receipt reference is required for bank/counter payment';
        }
        if (requiresPayment && !formData.applicationFeePaid) {
          errors.applicationFeePaid = 'Payment must be completed before submitting';
        }
        if (!formData.declaration) {
          errors.declaration = 'Please agree to the declaration before submitting';
        }

        const requiredDocumentIds = getRequiredDocumentIds(formData.selectedPermitTypes || formData.applicationType);
        const hasRealFileStep6 = (docId) => {
          const files = formData.documents?.[docId];
          return Array.isArray(files) && files.length > 0 && files.some((f) => isUsableDocumentFile(f));
        };
        const missingDocuments = requiredDocumentIds.filter((docId) => !hasRealFileStep6(docId));
        if (missingDocuments.length > 0) {
          const stubsCount = requiredDocumentIds.filter(id => {
            const files = formData.documents?.[id];
            return Array.isArray(files) && files.length > 0 && files.some(f => f?._isDraftStub);
          }).length;

          if (stubsCount > 0) {
            errors.documents = `Your draft was resumed, but you MUST re-upload ${stubsCount} required document(s) before submitting.`;
          } else {
            errors.documents = 'Required documents are missing before submission. Please upload them in Step 3.';
          }
          errors.missingDocuments = missingDocuments;
        }
      }
      if (step === 4 && formData.selectedPermitTypes?.includes('boundaryWall')) {
        if (!formData.wallLength) {
          errors.wallLength = 'Wall length is required when boundary wall permit is requested';
        }
        if (!formData.wallHeight) {
          errors.wallHeight = 'Wall height is required when boundary wall permit is requested';
        }
        if (!formData.wallMaterials?.trim()) {
          errors.wallMaterials = 'Wall material details are required when boundary wall permit is requested';
        }
      }
      return errors;
    };

    const errors = validateStep(currentStep);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      error('Please fill all required fields before continuing.');
      return;
    }

    if (currentStep < steps.length) {
      if (currentStep === 3) {
        try {
          await persistDraftDocumentsIfNeeded();
        } catch (persistError) {
          error(persistError.message || 'Failed to persist uploaded documents for draft');
          return;
        }
      }
      const nextStep = currentStep + 1;
      saveDraft(nextStep);
      setCurrentStep(nextStep);
      window.scrollTo(0, 0);
      
      // Sync to backend in the background if we have enough info (Step 2 completed)
      if (currentStep >= 2) {
        syncDraftToBackend(formData);
      }
    } else {
      saveDraft(currentStep);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      saveDraft(currentStep - 1);
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = () => {
    const submitApplication = async () => {
      if (isSubmitting) {
        return;
      }

      if (!token) {
        error('You are not signed in. Please login again before submitting.');
        return;
      }

      const selectedPermitCodes = (formData.selectedPermitTypes || [])
        .map((permitType) => (permitType === 'boundaryWall' ? 'boundary_wall' : permitType))
        .filter(Boolean);

      // Build project_details JSON from Step 4 form fields
      const projectDetails = {
        buildingNature: formData.buildingNature || '',
        buildingUse: formData.buildingUse || '',
        existingBuildings: formData.existingBuildings || '',
        roadWidth: formData.roadWidth || '',
        boundaryNorth: formData.boundaryNorth || '',
        boundarySouth: formData.boundarySouth || '',
        boundaryEast: formData.boundaryEast || '',
        boundaryWest: formData.boundaryWest || '',
        numberOfFloors: formData.numberOfFloors || '',
        totalFloorArea: formData.totalFloorArea || '',
        frontSetback: formData.frontSetback || '',
        rearSetback: formData.rearSetback || '',
        sideSetback1: formData.sideSetback1 || '',
        sideSetback2: formData.sideSetback2 || '',
        waterSource: formData.waterSource || '',
        wastewaterMethod: formData.wastewaterMethod || '',
        constructionCost: formData.constructionCost || '',
        wallLength: formData.wallLength || '',
        wallHeight: formData.wallHeight || '',
        wallMaterials: formData.wallMaterials || '',
        subdivisionNature: formData.subdivisionNature || '',
        subdivisionUse: formData.subdivisionUse || '',
        numberOfLots: formData.numberOfLots || '',
        smallestLotExtent: formData.smallestLotExtent || '',
      };

      const payload = {
        application_type: formData.applicationType || 'building',
        submitted_applicant_name: formData.applicantName,
        submitted_nic_number: formData.nicNumber,
        submitted_email: formData.email,
        submitted_address: formData.applicantAddress,
        submitted_contact: formData.contactNumber,
        selected_permit_codes: selectedPermitCodes,
        // Step 2 — Property details
        assessment_number: formData.assessmentNumber || '',
        deed_number: formData.deedNumber || '',
        survey_plan_ref: formData.surveyPlan || '',
        land_extent: formData.landExtent || '',
        // Step 4 — Project details (stored as JSONB)
        project_details: projectDetails,
        // Step 5 — Location
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        // Step 6 — Declaration
        declaration_accepted: formData.declaration === true,
      };

      setIsSubmitting(true);

      try {
        let url = `${API_BASE}/applications`;
        let method = 'POST';

        if (isResubmitMode) {
          url = `${API_BASE}/applications/${formData.dbId}/resubmit`;
          method = 'PATCH';
        } else if (formData.dbId) {
          // If we already have a draft in the DB, use the specific submit-draft endpoint
          url = `${API_BASE}/applications/${formData.dbId}/draft/submit`;
          method = 'POST';
        }

        const createResponse = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const createPayload = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(createPayload?.error?.message || createPayload?.error || createPayload?.message || `Failed to ${isResubmitMode ? 'resubmit' : 'create'} application`);
        }

        const createdApplication = createPayload.application || {};
        const applicationDbId = createdApplication.id;
        const applicationCode = formatApplicationCode(
          createdApplication.application_code
            || buildFallbackApplicationCode(createdApplication.id, createdApplication.application_type || formData.applicationType)
        );

        const uploadedEntries = Object.entries(formData.documents || {})
          .flatMap(([docType, files]) => (Array.isArray(files) ? files : []).filter(Boolean).map((file) => ({ docType, file })))
          .filter(({ file }) => isBrowserFileObject(file)); // Upload only fresh File objects

        if (applicationDbId && uploadedEntries.length > 0) {
          try {
            const uploadFormData = new FormData();
            uploadedEntries.forEach(({ docType, file }) => {
              uploadFormData.append('files', file);
              uploadFormData.append('doc_types', docType);
            });

            const uploadResponse = await fetch(`${API_BASE}/applications/${applicationDbId}/documents`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: uploadFormData,
            });

            const uploadPayload = await uploadResponse.json();
            if (!uploadResponse.ok) {
              throw new Error(uploadPayload?.error?.message || uploadPayload?.error || uploadPayload?.message || 'Application created, but document upload failed');
            }
          } catch (uploadError) {
            error(uploadError.message || 'Application created, but document upload failed. You can re-upload from the dashboard.');
          }
        }

        const submittedAt = createdApplication.submission_date || new Date().toISOString();
        const submissionData = {
          ...formData,
          applicationId: applicationCode,
          applicationDbId,
          dbId: applicationDbId,
          applicationCode,
          selectedPermitTypes: formData.selectedPermitTypes || [],
          submissionMode: regularizationContext ? 'regularization' : 'standard',
          regularizationContext,
          submittedAt,
        };

        queuePlanningSubmission(submissionData);

        setSubmissionSuccess(submissionData);
        setShowWizard(false);
        clearDraft();
        success(`Application submitted successfully. ID: ${applicationCode}. You will receive an email confirmation shortly.`);
      } catch (submitError) {
        error(submitError.message || 'Failed to submit application');
      } finally {
        setIsSubmitting(false);
      }
    };

    submitApplication();
  };

  const handleSaveDraftOnly = async () => {
    try {
      await persistDraftDocumentsIfNeeded();
      saveDraft();
      info('Application draft saved. Previously uploaded documents are preserved.');
    } catch (persistError) {
      saveDraft();
      error(persistError.message || 'Draft saved locally, but document persistence failed.');
    }
  };

  const handleEditStep = (stepNumber) => {
    if (stepNumber >= 1 && stepNumber <= steps.length) {
      setCurrentStep(stepNumber);
      window.scrollTo(0, 0);
    }
  };

  const resetFormAfterSubmission = () => {
    clearDraft();
    setCurrentStep(1);
    setValidationErrors({});
    setSubmissionSuccess(null);
    setFormData({
      selectedPermitTypes: ['building'],
      applicationType: 'building',
      applicationFeePaid: false,
      applicationFeeMethod: '',
      applicationFeeReceiptRef: '',
      applicationFeeTransactionId: '',
      applicationFeePaidAt: '',
      paymentCardNumber: '',
      paymentExpiry: '',
      paymentCvv: '',
      paymentCardHolder: '',
      applicantName: '',
      nicNumber: '',
      applicantAddress: '',
      contactNumber: '',
      email: '',
      assessmentNumber: '',
      deedNumber: '',
      surveyPlan: '',
      landExtent: '',
      documents: {},
      documentCustomNames: {},
      buildingNature: '',
      buildingUse: '',
      existingBuildings: '',
      roadWidth: '',
      boundaryNorth: '',
      boundarySouth: '',
      boundaryEast: '',
      boundaryWest: '',
      numberOfFloors: '',
      totalFloorArea: '',
      frontSetback: '',
      rearSetback: '',
      sideSetback1: '',
      sideSetback2: '',
      waterSource: '',
      wastewaterMethod: '',
      constructionCost: '',
      wallLength: '',
      wallHeight: '',
      wallMaterials: '',
      requiresBoundaryWallPermission: false,
      subdivisionNature: '',
      subdivisionUse: '',
      numberOfLots: '',
      smallestLotExtent: '',
      latitude: null,
      longitude: null,
      declaration: false
    });
  };

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800">Start New Application</h1>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
              Draft saved at {formatTime(lastSaved)}
            </div>
          )}
          <Button onClick={() => setShowWizard(true)}>Launch Application Form</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {regularizationContext && (
          <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h2 className="text-base font-semibold text-amber-900">Regularization Application (As-Built)</h2>
            <p className="text-sm text-amber-800 mt-1">
              This application is linked to COC violation reference {regularizationContext.cocViolationRef || 'N/A'} from original application {regularizationContext.originalApplicationId || 'N/A'}.
              Upload as-built plans and supporting documents matching the current site condition.
            </p>
          </div>
        )}
        {[
          {
            title: 'Building Permit (Including Boundary Wall Section)',
            description: 'For new construction, major modifications, and boundary wall requests under the same application file',
            docs: ['Building/Boundary Plan', 'Survey Plan', 'Deed'],
            fee: formatFeeLabel(feeConfig.building_permit),
          },
          {
            title: 'Land Subdivision',
            description: 'Divide land into multiple parcels',
            docs: ['Subdivision Plan', 'Master Plan', 'Deed'],
            fee: formatFeeLabel(feeConfig.land_subdivision),
          },
        ].map((app) => (
          <div key={app.title} className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{app.title}</h3>
            <p className="text-sm text-slate-600 mb-4">{app.description}</p>
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-slate-700">Required Documents:</p>
              <ul className="text-xs text-slate-600 space-y-1">
                {app.docs.map((doc) => (
                  <li key={doc}>• {doc}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm font-semibold text-blue-700">Fee: {app.fee}</p>
          </div>
        ))}
      </div>

      {/* Modal with Step Wizard */}
      <Modal 
        open={showWizard} 
        onClose={() => setShowWizard(false)} 
        title={`New Application Form - Step ${currentStep} of ${steps.length}`} 
        size="xl"
      >
        <div className="relative space-y-6">
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-2xl min-h-[400px]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-600 font-medium animate-pulse">Initializing Correction Portal...</p>
            </div>
          )}
          {/* Progress Bar */}
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    currentStep === step.number
                      ? 'bg-blue-600 text-white'
                      : currentStep > step.number
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {currentStep > step.number ? <CheckCircle2 size={20} /> : step.number}
                </div>
                <div className={`hidden md:block ml-2 text-sm font-medium ${
                  currentStep >= step.number ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {step.label}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 rounded ${
                      currentStep > step.number ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  ></div>
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="min-h-96">
            <CurrentStepComponent
              key={`step-${currentStep}-cfg-${checklistVersion}`}
              formData={formData}
              onUpdate={handleFormUpdate}
              errors={validationErrors}
              onEditStep={handleEditStep}
              feeConfig={feeConfig}
            />
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="secondary"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} className="mr-2" />
              Save & Previous
            </Button>

            <div className="text-sm text-slate-600 flex items-center gap-3">
              <span>Step {currentStep} of {steps.length}</span>
              {lastSaved && <span className="text-green-700">✓ Draft saved</span>}
              {lastSaved && (
                <button
                  onClick={clearDraft}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Clear Draft
                </button>
              )}
            </div>

            {currentStep === steps.length ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={handleSaveDraftOnly}
                  className="border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                >
                  Save as Draft
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed">
                  <CheckCircle2 size={18} className="mr-2" />
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={handleSaveDraftOnly}
                  className="border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                >
                  Save as Draft
                </Button>
                <Button onClick={handleNext}>
                  Save & Next
                  <ChevronRight size={18} className="ml-2" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Submission Success Modal */}
      {submissionSuccess && (
        <Modal 
          open={!!submissionSuccess} 
          onClose={resetFormAfterSubmission}
          title="Application Submitted Successfully!"
          size="lg"
        >
          <div className="space-y-6">
            {/* Success Header */}
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-16 h-16 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Your application has been submitted!</h2>
              <p className="text-slate-600">Thank you for submitting your permit application.</p>
            </div>

            {/* Application Details */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-slate-600">Application ID</p>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-blue-700">{submissionSuccess.applicationId}</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(submissionSuccess.applicationId);
                      info('Application ID copied to clipboard');
                    }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-100"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
              </div>
              <div className="pt-3 border-t border-blue-200">
                <p className="text-xs text-slate-600">Submission Date & Time</p>
                <p className="font-medium text-slate-800">{new Date(submissionSuccess.submittedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</p>
              </div>
            </div>

            {/* Important Information */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">What Happens Next?</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">1.</span>
                  <span>A Planning Officer will be assigned to review your application within 5-7 working days</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">2.</span>
                  <span>You will receive email updates at <strong>{submissionSuccess.email}</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">3.</span>
                  <span>A site inspection may be scheduled depending on the application type</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">4.</span>
                  <span>You can track your application status from your dashboard</span>
                </li>
              </ul>
            </div>

            {/* Download Options */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Download Your Application</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => downloadApplicationAsHTML(submissionSuccess)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 font-medium transition-all text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download as HTML
                </button>
                <button
                  type="button"
                  onClick={() => downloadApplicationAsPDF(submissionSuccess)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 font-medium transition-all text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download as Text
                </button>
              </div>
              <p className="text-xs text-slate-600 text-center">You can download your application in different formats for your records</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={resetFormAfterSubmission}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
              >
                <CheckCircle2 size={18} className="inline mr-2" />
                Close & Start New Application
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default NewApplication;
