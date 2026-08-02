import { describe, expect, it } from 'vitest';
import { fmt, good, inRange, repaidFor, targetFor } from '../FactoryOS.jsx';

describe('FactoryOS helpers', () => {
  it('formats numbers for display', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    expect(fmt('bad-input')).toBe('0');
  });

  it('checks date ranges', () => {
    expect(inRange('2026-07-23', '2026-07-01', '2026-07-31')).toBe(true);
    expect(inRange('2026-08-01', '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('derives production and finance totals', () => {
    expect(good({ cartonsMade: 40, rejects: 7 })).toBe(33);
    expect(targetFor('Water Bags (Hard)', [{ name: 'Water Bags (Hard)', target: '25' }])).toBe(25);
    expect(repaidFor('loan-1', [
      { reference: 'loan-1', amount: 1000 },
      { reference: 'loan-1', amount: '250' },
      { reference: 'loan-2', amount: 500 },
    ])).toBe(1250);
  });
});