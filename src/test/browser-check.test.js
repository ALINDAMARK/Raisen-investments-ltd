import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_FIXTURE = {
  settings: { value: JSON.stringify({}) },
  employees: { value: JSON.stringify([]) },
  attendance: { value: JSON.stringify([]) },
  production: { value: JSON.stringify([]) },
  advances: { value: JSON.stringify([]) },
  machines: { value: JSON.stringify([]) },
  maintenance: { value: JSON.stringify([]) },
  rawMaterials: { value: JSON.stringify([]) },
  grn: { value: JSON.stringify([]) },
  materialIssue: { value: JSON.stringify([]) },
  customers: { value: JSON.stringify([]) },
  suppliers: { value: JSON.stringify([]) },
  products: { value: JSON.stringify([]) },
  sales: { value: JSON.stringify([]) },
  delivery: { value: JSON.stringify([]) },
  dispatch: { value: JSON.stringify([]) },
  receipts: { value: JSON.stringify([]) },
  expenses: { value: JSON.stringify([]) },
  cashbook: { value: JSON.stringify([]) },
  loans: { value: JSON.stringify([]) },
  loanRepayments: { value: JSON.stringify([]) },
  payables: { value: JSON.stringify([]) },
  prepayments: { value: JSON.stringify([]) },
};

describe('browser accessibility and performance', () => {
  it('renders the login shell with no axe violations and a fast first paint', async () => {
    window.storage = {
      async get(key) {
        return STORAGE_FIXTURE[key] || { value: null };
      },
      async set() {
        return { ok: true };
      },
    };

    window.factoryAuth = {
      async login() {
        return { user: { name: 'Smoke User', role: 'manager' } };
      },
      async me() {
        return { user: { name: 'Smoke User', role: 'manager' } };
      },
      logout() {},
      token() {
        return null;
      },
    };

    document.title = 'Raisen Investments Ltd';
    document.documentElement.lang = 'en';

    const start = performance.now();
    const container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);

    const { default: FactoryOS } = await import('../FactoryOS.jsx');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(FactoryOS));
      await Promise.resolve();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const renderTimeMs = performance.now() - start;
    const results = await axe.run(document, {
      runOnly: {
        type: 'rule',
        values: ['button-name', 'document-title', 'html-has-lang', 'label', 'aria-input-field-name'],
      },
    });

    expect(renderTimeMs).toBeLessThan(1500);
    expect(results.violations).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });
});