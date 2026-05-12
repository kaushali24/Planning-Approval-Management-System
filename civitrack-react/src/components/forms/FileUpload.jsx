import React, { useRef, useState } from 'react';
import { Upload, X, RefreshCw, AlertCircle, Eye, CheckCircle2 } from 'lucide-react';

const FileUpload = ({
  label,
  accept,
  multiple,
  onFilesSelect,
  files = [],
  maxFileSizeMB = 10,
  customDocumentName = '',
  onDocumentNameChange,
}) => {
  const inputRef = useRef(null);
  const [validationError, setValidationError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

  const validateFiles = (selectedFiles) => {
    for (const file of selectedFiles) {
      const maxBytes = maxFileSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        return `${file.name} exceeds ${maxFileSizeMB} MB.`;
      }

      if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        return `${file.name} is not a supported format. Use PDF, JPG, JPEG, or PNG.`;
      }
    }

    return '';
  };

  const previewFile = (file) => {
    if (!file) return;
    setValidationError('');

    if (file._isPersistedUpload) {
      if (file.fileUrl) {
        window.open(file.fileUrl, '_blank');
      }
      return;
    }

    if (!(typeof File !== 'undefined' && file instanceof File)) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    window.open(previewUrl, '_blank');

    // Delay revoke so browser tab can fully load the blob URL.
    setTimeout(() => URL.revokeObjectURL(previewUrl), 60 * 1000);
  };

  const simulateUploadProgress = (selectedFiles) => {
    setIsUploading(true);
    setUploadProgress(0);

    let progress = 0;
    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 12;
      if (progress >= 100) {
        clearInterval(timer);
        setUploadProgress(100);
        onFilesSelect(selectedFiles);
        setIsUploading(false);
        setUploadMessage(
          `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded successfully.`
        );
        return;
      }

      setUploadProgress(progress);
    }, 100);
  };

  const handleChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const error = validateFiles(selectedFiles);
    if (error) {
      setValidationError(error);
      setUploadMessage('Upload failed. Please fix the validation error and try again.');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setValidationError('');
    setUploadMessage('');
    simulateUploadProgress(selectedFiles);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeFile = (idx) => {
    setValidationError('');
    setUploadMessage('');
    const updatedFiles = files.filter((_, i) => i !== idx);
    onFilesSelect(updatedFiles);
    if (updatedFiles.length === 0) {
      onDocumentNameChange?.('');
    }
  };

  const triggerPicker = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      <label
        className={`flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition ${
          isUploading ? 'cursor-not-allowed opacity-70 pointer-events-none' : 'cursor-pointer'
        }`}
      >
        <div className="flex flex-col items-center justify-center">
          <Upload className="w-6 h-6 text-slate-400 mb-2" />
          <span className="text-sm text-slate-600">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </span>
          <span className="text-xs text-slate-500 mt-1">
            {accept || 'PDF, JPG, JPEG, PNG'} | Max {maxFileSizeMB} MB
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
        />
      </label>

      {validationError && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">{validationError}</p>
        </div>
      )}

      {isUploading && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-blue-700">Uploading...</p>
            <p className="text-xs text-blue-700">{uploadProgress}%</p>
          </div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {uploadMessage && !validationError && !isUploading && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-green-700">{uploadMessage}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => {
            const isDraftStub = file && file._isDraftStub === true;
            const isPersistedUpload = file && file._isPersistedUpload === true;
            const canPreview = !isDraftStub && ((typeof File !== 'undefined' && file instanceof File) || Boolean(file?.fileUrl));

            return (
            <div key={idx} className={`p-3 rounded-lg border space-y-3 ${isDraftStub ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">
                  {customDocumentName?.trim() || file.name}
                </p>
                {customDocumentName?.trim() && (
                  <p className="text-xs text-slate-500 truncate">Original file: {file.name}</p>
                )}
                {isDraftStub ? (
                  <p className="text-xs text-amber-600 font-medium mt-1">
                    ⚠ Previously selected — please re-select this file to upload
                  </p>
                ) : isPersistedUpload ? (
                  <p className="text-xs text-green-600 font-medium mt-1">
                    ✓ Previously uploaded and saved with your draft
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Document Name (Your Label)</label>
                  <input
                    type="text"
                    value={customDocumentName}
                    onChange={(e) => onDocumentNameChange?.(e.target.value)}
                    placeholder="Optional: e.g., Updated deed copy"
                    className="mt-1 w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end justify-start md:justify-end gap-2">
                  {canPreview && (
                    <button
                      type="button"
                      onClick={() => previewFile(file)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                  )}
                  {isDraftStub ? (
                    <button
                      type="button"
                      onClick={triggerPicker}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-amber-400 rounded text-amber-700 bg-amber-100 hover:bg-amber-200 font-medium"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-select File
                    </button>
                  ) : (
                    !multiple && (
                      <button
                        type="button"
                        onClick={triggerPicker}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Replace
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
