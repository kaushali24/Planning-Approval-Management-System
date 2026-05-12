import React from 'react';
import { Building2, Grid3x3, FileText, CheckCircle2, Circle } from 'lucide-react';
import { getRequiredDocumentsByType } from '../../data/planningWorkflowStore';

const Step1_TypeSelection = ({ formData, onUpdate, errors = {} }) => {
  const selectedTypes = formData.selectedPermitTypes || [];
  const isSubdivisionMain = selectedTypes.includes('subdivision');
  const isBuildingMain = !isSubdivisionMain;

  const buildingScope = selectedTypes.includes('building') && selectedTypes.includes('boundaryWall')
    ? 'both'
    : selectedTypes.includes('boundaryWall')
      ? 'boundary-only'
      : 'building-only';

  const types = [
    {
      id: 'building',
      icon: Building2,
      title: 'Building Permit',
      desc: 'For new houses, additions, and commercial buildings.',
      fee: 'LKR 750.00',
    },
    {
      id: 'subdivision',
      icon: Grid3x3,
      title: 'Land Subdivision Permit',
      desc: 'For blocking out a larger land into smaller lots.',
      fee: 'LKR 500.00',
    },
  ];

  // Dynamically resolve required documents for the current selection
  const requiredDocs = selectedTypes.length > 0 ? getRequiredDocumentsByType(selectedTypes) : [];
  const mandatoryDocs = requiredDocs.filter((d) => d.required !== false);
  const optionalDocs = requiredDocs.filter((d) => d.required === false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Select Application Type</h2>
        <p className="text-slate-500">Choose one main permit type. You can optionally add boundary wall permission below.</p>
        {errors.applicationType && (
          <p className="text-sm text-red-600 mt-2">{errors.applicationType}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {types.map((type) => {
          const Icon = type.icon;
          const isSelected = type.id === 'building' ? isBuildingMain : isSubdivisionMain;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                const nextSelection = type.id === 'subdivision' ? ['subdivision'] : ['building'];
                onUpdate({ selectedPermitTypes: nextSelection });
              }}
              className={`text-left p-6 border-2 rounded-xl transition ${
                isSelected
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 hover:border-blue-600 hover:bg-blue-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
              <div className="bg-blue-100 text-blue-700 rounded-full p-3 inline-flex mb-3">
                <Icon className="w-6 h-6" />
              </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${isSelected ? 'border-blue-300 text-blue-700 bg-blue-100' : 'border-slate-300 text-slate-500 bg-white'}`}>
                  {isSelected ? 'Selected' : 'Select'}
                </span>
              </div>
              <h3 className="font-bold text-lg text-slate-800">{type.title}</h3>
              <p className="text-slate-500 text-sm mt-1">{type.desc}</p>
              <div className="mt-3 text-xs text-blue-600 font-medium">Fee: {type.fee}</div>
            </button>
          );
        })}
      </div>

      {isBuildingMain && (
        <div className="p-5 border rounded-xl bg-slate-50 space-y-3">
          <h3 className="text-lg font-semibold text-slate-800">Building Permit Scope</h3>
          <p className="text-sm text-slate-600">Choose what this Building main application includes.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="buildingScope"
                checked={buildingScope === 'building-only'}
                onChange={() => onUpdate({ selectedPermitTypes: ['building'] })}
                className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Building only</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="buildingScope"
                checked={buildingScope === 'boundary-only'}
                onChange={() => onUpdate({ selectedPermitTypes: ['boundaryWall'] })}
                className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Boundary wall only</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="buildingScope"
                checked={buildingScope === 'both'}
                onChange={() => onUpdate({ selectedPermitTypes: ['building', 'boundaryWall'] })}
                className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Both together (building + boundary wall)</span>
            </label>
          </div>
        </div>
      )}

      <div className="p-5 border rounded-xl bg-slate-50 space-y-3">
        <h3 className="text-lg font-semibold text-slate-800">Application Fee Notice</h3>
        <p className="text-sm text-slate-600">
          The main permit application fee is paid at Step 6 (Review &amp; Submit). Boundary wall permission follows the same upfront payment rule.
        </p>
      </div>

      {/* Dynamic Document Requirements Panel */}
      {selectedTypes.length > 0 && requiredDocs.length > 0 && (
        <div className="p-5 border border-blue-200 rounded-xl bg-blue-50 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-700" />
            <h3 className="text-lg font-semibold text-blue-900">Documents You'll Need (Step 3)</h3>
          </div>
          <p className="text-sm text-blue-800">
            Based on your selection, prepare these documents before proceeding to Step 3.
          </p>

          {mandatoryDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Required</p>
              <div className="space-y-1">
                {mandatoryDocs.map((doc) => (
                  <div key={doc.id} className="flex items-start gap-2 text-sm text-blue-900">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                    <span>{doc.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optionalDocs.length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Optional</p>
              <div className="space-y-1">
                {optionalDocs.map((doc) => (
                  <div key={doc.id} className="flex items-start gap-2 text-sm text-slate-600">
                    <Circle className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
                    <span>{doc.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-5 border border-amber-200 rounded-xl bg-amber-50 space-y-3">
        <h3 className="text-lg font-semibold text-amber-900">Guideline Confirmation (Required)</h3>
        <p className="text-sm text-amber-900">
          Before continuing, you must confirm that you reviewed the Planning Approval Guidelines &amp; Regulations for your selected permit type.
        </p>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(formData.guidelinesAcknowledged)}
            onChange={(e) => onUpdate({ guidelinesAcknowledged: e.target.checked })}
            className="h-4 w-4 mt-1 border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">
            I confirm that I have reviewed the applicable guidelines, regulatory conditions, and required documents before submitting this application.
          </span>
        </label>
        {errors.guidelinesAcknowledged && (
          <p className="text-sm text-red-600">{errors.guidelinesAcknowledged}</p>
        )}
      </div>
    </div>
  );
};

export default Step1_TypeSelection;

