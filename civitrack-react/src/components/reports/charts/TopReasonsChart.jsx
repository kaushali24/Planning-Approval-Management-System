import React from 'react';
import DistributionBars from './DistributionBars.jsx';

const TopReasonsChart = ({ rows = [], onReasonClick }) => (
  <DistributionBars
    title="Top Modification Reasons"
    rows={rows}
    labelKey="reason"
    valueKey="count"
    emptyText="No correction/rejection reasons recorded for this period."
    onRowClick={(row) => onReasonClick?.(row)}
  />
);

export default TopReasonsChart;

