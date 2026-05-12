import React, { useState } from 'react';
import { MapPin, Link as LinkIcon, AlertCircle, ExternalLink } from 'lucide-react';

const Step5_LocationMap = ({ formData, onUpdate }) => {
  const [locationLink, setLocationLink] = useState(formData.locationLink || '');
  const [linkError, setLinkError] = useState('');
  const [extractedCoords, setExtractedCoords] = useState(null);

  // Extract coordinates from location link
  const extractCoordinatesFromLink = (link) => {
    if (!link) return null;
    
    // Google Maps: maps.google.com/?q=6.9271,80.7789 or google.com/maps/place/...
    const googleMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (googleMatch) {
      return { latitude: parseFloat(googleMatch[1]), longitude: parseFloat(googleMatch[2]) };
    }

    // OpenStreetMap: osm.org/search?query=... or with #map=zoom/lat/lon
    const osmMatch = link.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
    if (osmMatch) {
      return { latitude: parseFloat(osmMatch[1]), longitude: parseFloat(osmMatch[2]) };
    }

    // Generic lat,lon pattern
    const genericMatch = link.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (genericMatch) {
      return { latitude: parseFloat(genericMatch[1]), longitude: parseFloat(genericMatch[2]) };
    }

    return null;
  };

  const handleLinkChange = (e) => {
    const link = e.target.value;
    setLocationLink(link);
    setLinkError('');
    setExtractedCoords(null);

    if (!link.trim()) {
      onUpdate({ locationLink: '', latitude: '', longitude: '' });
      return;
    }

    // Validate URL format
    try {
      new URL(link);
    } catch {
      setLinkError('Invalid URL format. Please paste a complete location link.');
      return;
    }

    // Extract coordinates
    const coords = extractCoordinatesFromLink(link);
    if (coords) {
      setExtractedCoords(coords);
      onUpdate({
        locationLink: link,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } else {
      setLinkError('Could not extract coordinates from this link. Please ensure it includes location data.');
    }
  };

  const handleManualCoordchange = (type, value) => {
    onUpdate({
      [type]: value,
      locationLink: locationLink,
    });
  };

  const openGoogleMaps = () => {
    // Open Google Maps for Sri Lanka centered view
    window.open('https://maps.google.com/maps?q=6.9271,80.7789', '_blank');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Site Location</h2>
        <p className="text-slate-600">Share your property location using a Google Maps or OpenStreetMap link. Our officers can then locate your site easily.</p>
      </div>

      {/* Location Link Input */}
      <div className="p-6 border-2 border-blue-300 rounded-xl bg-blue-50 space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <LinkIcon size={20} className="text-blue-700" />
          <h3 className="text-lg font-semibold text-blue-900">Share Location Link</h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Paste your location link here
          </label>
          <input
            type="text"
            placeholder="e.g., https://maps.google.com/?q=6.9271,80.7789"
            value={locationLink}
            onChange={handleLinkChange}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* Quick Action Button */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={openGoogleMaps}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            <MapPin size={16} />
            Open Google Maps
            <ExternalLink size={14} />
          </button>
          <p className="text-xs text-slate-600 flex items-center">
            Find your location, then copy the link from the address bar and paste it above.
          </p>
        </div>

        {linkError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{linkError}</p>
          </div>
        )}

        {extractedCoords && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✓ <strong>Location extracted:</strong> Latitude {extractedCoords.latitude.toFixed(4)}°, Longitude {extractedCoords.longitude.toFixed(4)}°
            </p>
          </div>
        )}
      </div>

      {/* Manual Coordinate Fallback */}
      <div className="p-6 border rounded-xl bg-slate-50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Or Enter GPS Coordinates Manually</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Latitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g., 6.9271"
              value={formData.latitude || ''}
              onChange={(e) => handleManualCoordchange('latitude', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Enter positive for North, negative for South</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Longitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g., 80.7789"
              value={formData.longitude || ''}
              onChange={(e) => handleManualCoordchange('longitude', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Enter positive for East, negative for West</p>
          </div>
        </div>
      </div>

      {/* Information Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5">
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold">ℹ</div>
          </div>
          <div className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>Quick steps:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Click "Open Google Maps" button above</li>
              <li>Search for your property address</li>
              <li>Copy the link from your browser address bar</li>
              <li>Paste it in the "Share Location Link" field</li>
            </ol>
            <p className="mt-3">
              <strong>Supported link formats:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Google Maps: https://maps.google.com/?q=6.9271,80.7789</li>
              <li>OpenStreetMap: https://www.openstreetmap.org/#map=15/6.9271/80.7789</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step5_LocationMap;
