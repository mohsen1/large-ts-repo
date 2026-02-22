export interface PageSignal {
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  tags?: string[];
}

export class Pager {
  constructor(private readonly sink: (signal: PageSignal) => void = console.log) {}

  async send(signal: PageSignal): Promise<void> {
    this.sink(signal);
  }

  async critical(body: string): Promise<void> {
    await this.send({ title: 'critical', body, severity: 'critical' });
  }

  async warning(body: string): Promise<void> {
    await this.send({ title: 'warning', body, severity: 'warning' });
  }
}
