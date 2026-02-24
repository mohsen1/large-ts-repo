export type ContinuityLabMode = 'view' | 'draft' | 'running' | 'analysis';
export interface ContinuityLabProps {
  readonly tenant: string;
  readonly mode: ContinuityLabMode;
}
