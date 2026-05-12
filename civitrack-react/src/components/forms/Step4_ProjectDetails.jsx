import React from 'react';
import Input from '../ui/Input.jsx';
import Textarea from '../ui/Textarea.jsx';

const Step4_ProjectDetails = ({ formData, onUpdate }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onUpdate({ [name]: value });
  };

  const renderBuildingDetails = () => (
    <div className="space-y-6">
      {/* Nature of Development */}
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Nature of Proposed Development</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nature of Development</label>
            <select
              name="buildingNature"
              value={formData.buildingNature || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="new">New Building</option>
              <option value="addition">Addition / Alteration</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Proposed Use of Building</label>
            <select
              name="buildingUse"
              value={formData.buildingUse || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>
      </div>

      {/* Site & Boundary Details */}
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Site & Boundary Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Existing Buildings on Land"
            name="existingBuildings"
            value={formData.existingBuildings || ''}
            onChange={handleChange}
            placeholder="e.g., One old house to be demolished"
          />
          <Input
            label="Width of Access Road (in feet)"
            name="roadWidth"
            type="number"
            value={formData.roadWidth || ''}
            onChange={handleChange}
          />
          <Input
            label="North Boundary Details"
            name="boundaryNorth"
            value={formData.boundaryNorth || ''}
            onChange={handleChange}
          />
          <Input
            label="South Boundary Details"
            name="boundarySouth"
            value={formData.boundarySouth || ''}
            onChange={handleChange}
          />
          <Input
            label="East Boundary Details"
            name="boundaryEast"
            value={formData.boundaryEast || ''}
            onChange={handleChange}
          />
          <Input
            label="West Boundary Details"
            name="boundaryWest"
            value={formData.boundaryWest || ''}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Building Specifications & Setbacks */}
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Building Specifications & Setbacks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Number of Floors"
            name="numberOfFloors"
            type="number"
            value={formData.numberOfFloors || ''}
            onChange={handleChange}
          />
          <Input
            label="Total Floor Area (Sq. Ft.)"
            name="totalFloorArea"
            type="number"
            value={formData.totalFloorArea || ''}
            onChange={handleChange}
          />
          <Input
            label="Front Setback (from road)"
            name="frontSetback"
            type="number"
            value={formData.frontSetback || ''}
            onChange={handleChange}
          />
          <Input
            label="Rear Setback"
            name="rearSetback"
            type="number"
            value={formData.rearSetback || ''}
            onChange={handleChange}
          />
          <Input
            label="Side Setback 1"
            name="sideSetback1"
            type="number"
            value={formData.sideSetback1 || ''}
            onChange={handleChange}
          />
          <Input
            label="Side Setback 2"
            name="sideSetback2"
            type="number"
            value={formData.sideSetback2 || ''}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Utilities */}
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Utilities & Other Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Source of Water Supply</label>
            <select
              name="waterSource"
              value={formData.waterSource || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="main">Main Line</option>
              <option value="well">Well</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Method of Wastewater Disposal</label>
            <select
              name="wastewaterMethod"
              value={formData.wastewaterMethod || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="septic">Septic Tank / Soakage Pit</option>
              <option value="sewer">Sewer Line</option>
            </select>
          </div>
          <Input
            label="Estimated Cost of Construction (LKR)"
            name="constructionCost"
            type="number"
            value={formData.constructionCost || ''}
            onChange={handleChange}
            className="md:col-span-2"
          />
        </div>
      </div>
    </div>
  );

  const renderBoundaryWallDetails = () => (
    <div className="space-y-6">
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Boundary Wall Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Total Length of Wall (in feet)"
            name="wallLength"
            type="number"
            value={formData.wallLength || ''}
            onChange={handleChange}
          />
          <Input
            label="Maximum Height of Wall (from ground)"
            name="wallHeight"
            type="number"
            value={formData.wallHeight || ''}
            onChange={handleChange}
          />
          <Input
            label="Materials Used"
            name="wallMaterials"
            value={formData.wallMaterials || ''}
            onChange={handleChange}
            placeholder="e.g., Brick, Cement Block"
            className="md:col-span-2"
          />
        </div>
      </div>
    </div>
  );

  const renderSubdivisionDetails = () => (
    <div className="space-y-6">
      <div className="p-6 border rounded-xl bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Proposed Subdivision Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nature of Development</label>
            <select
              name="subdivisionNature"
              value={formData.subdivisionNature || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="subdivision">Subdivision</option>
              <option value="amalgamation">Amalgamation</option>
              <option value="survey">Survey</option>
              <option value="extract">Extract</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Proposed Use</label>
            <select
              name="subdivisionUse"
              value={formData.subdivisionUse || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select option</option>
              <option value="residential-single">Residential (Single Unit)</option>
              <option value="residential-attached">Residential (Attached Housing)</option>
              <option value="commercial">Commercial/Office</option>
              <option value="stores">Stores</option>
              <option value="restaurant">Restaurant/Hotel</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Total Number of Lots to be Blocked Out"
            name="numberOfLots"
            type="number"
            value={formData.numberOfLots || ''}
            onChange={handleChange}
          />
          <Input
            label="Extent of the Smallest Lot Proposed"
            name="smallestLotExtent"
            value={formData.smallestLotExtent || ''}
            onChange={handleChange}
            placeholder="e.g., 6 Perches"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Project Details</h2>
        <p className="text-slate-600">Provide detailed information about your proposed development.</p>
      </div>

      {(formData.selectedPermitTypes || []).includes('building') && renderBuildingDetails()}
      {(formData.selectedPermitTypes || []).includes('boundaryWall') && renderBoundaryWallDetails()}
      {(formData.selectedPermitTypes || []).includes('subdivision') && renderSubdivisionDetails()}

      {!(formData.selectedPermitTypes || []).length && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">⚠️ Please select an application type first to see relevant fields.</p>
        </div>
      )}
    </div>
  );
};

export default Step4_ProjectDetails;
