import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptApplicationStats,
  adaptDrilldown,
  adaptModificationReasons,
  adaptRevenueSummary,
  adaptTrendData,
} from './reportAdapters.js';

test('adaptApplicationStats normalizes missing fields', () => {
  const adapted = adaptApplicationStats({
    totals: { totalApplications: '10', approved: 2 },
    byType: [{ type: 'building_permit', count: '3' }],
  });
  assert.equal(adapted.totals.totalApplications, 10);
  assert.equal(adapted.totals.correctionRequired, 0);
  assert.deepEqual(adapted.byType[0], { type: 'building_permit', count: 3 });
});

test('adaptRevenueSummary keeps numeric totals', () => {
  const adapted = adaptRevenueSummary({
    totals: { overallRevenue: '1000.50' },
    byType: [{ paymentType: 'application_fee', amount: '1500', transactionCount: '2' }],
  });
  assert.equal(adapted.totals.overallRevenue, 1000.5);
  assert.equal(adapted.byType[0].amount, 1500);
  assert.equal(adapted.byType[0].transactionCount, 2);
});

test('adaptModificationReasons defaults to empty arrays', () => {
  const adapted = adaptModificationReasons({});
  assert.equal(Array.isArray(adapted.byReason), true);
  assert.equal(adapted.byReason.length, 0);
});

test('adaptTrendData converts series values to numbers', () => {
  const adapted = adaptTrendData({
    applications: { series: [{ key: 'd1', label: 'Day 1', value: '4' }], change: '10' },
  });
  assert.equal(adapted.applications.series[0].value, 4);
  assert.equal(adapted.applications.change, 10);
});

test('adaptDrilldown returns rows safely', () => {
  const adapted = adaptDrilldown({ metric: 'revenue', rows: [{ id: 1 }] });
  assert.equal(adapted.metric, 'revenue');
  assert.equal(adapted.rows.length, 1);
});

