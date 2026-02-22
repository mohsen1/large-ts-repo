import { createEnvelope, Envelope } from '@shared/protocol';

export interface DashboardState {
  project: string;
  version: string;
  services: string[];
  flags: Record<string, boolean>;
}

export const dashboardState = (overrides: Partial<DashboardState>): DashboardState => ({
  project: 'large-ts-repo',
  version: process.version,
  services: ['api', 'worker', 'checkout', 'analytics'],
  flags: { darkMode: false, canary: true },
  ...overrides,
});

export const stateEnvelope = (state: DashboardState): Envelope<DashboardState> =>
  createEnvelope('admin.dashboard', state);

export const renderDashboard = async (): Promise<DashboardState> => {
  const state = dashboardState({});
  return state;
};
