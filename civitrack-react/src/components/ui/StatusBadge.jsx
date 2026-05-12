import React from 'react';
import { getStatusLabel, toKebabStatusKey } from '../../utils/statusLabels';
import { getStatusToneClass } from '../../utils/statusPresentation';

const StatusBadge = ({ status = 'draft', children }) => {
  const normalizedStatus = toKebabStatusKey(status);
  const cls = getStatusToneClass(normalizedStatus);
  const fallbackLabel = getStatusLabel(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children || fallbackLabel}
    </span>
  );
};

export default StatusBadge;
