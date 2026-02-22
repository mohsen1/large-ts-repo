import { EventEmitter } from 'node:events';

export interface Incident {
  id: string;
  severity: 'sev1' | 'sev2' | 'sev3';
  details: string;
  openAt: string;
  resolvedAt?: string;
}

export interface IncidentService {
  open(incident: Incident): void;
  resolve(id: string): void;
  active(): Incident[];
}

export class InMemoryIncidentService extends EventEmitter implements IncidentService {
  private list: Incident[] = [];

  open(incident: Incident): void {
    this.list.push(incident);
    this.emit('opened', incident);
  }

  resolve(id: string): void {
    const idx = this.list.findIndex((item) => item.id === id);
    if (idx < 0) return;
    this.list[idx] = { ...this.list[idx], resolvedAt: new Date().toISOString() };
    this.emit('resolved', this.list[idx]);
  }

  active(): Incident[] {
    return this.list.filter((incident) => incident.resolvedAt === undefined);
  }
}
