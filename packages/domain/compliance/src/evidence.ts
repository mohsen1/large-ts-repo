export interface Evidence {
  id: string;
  source: string;
  collectedAt: string;
  payload: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high';
}

export interface ComplianceWindow {
  id: string;
  items: Evidence[];
}

export const addEvidence = (window: ComplianceWindow, evidence: Evidence): ComplianceWindow => ({
  ...window,
  items: [...window.items, evidence],
});

export const filterBySeverity = (window: ComplianceWindow, severity: Evidence['severity']): ComplianceWindow => ({
  ...window,
  items: window.items.filter((entry) => entry.severity === severity),
});

export const hasCritical = (window: ComplianceWindow): boolean => {
  return window.items.some((entry) => entry.severity === 'high');
};
