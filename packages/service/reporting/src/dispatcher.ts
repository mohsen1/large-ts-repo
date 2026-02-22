import { Rendered, toCsv, toMarkdown } from '@domain/reporting/render';
import { ReportPayload } from '@domain/reporting/definitions';
import { createWriteStream } from 'node:fs';

export interface DispatchTarget {
  kind: 'csv' | 'md';
  name: string;
}

export const render = (payload: ReportPayload, target: DispatchTarget): Rendered => {
  if (target.kind === 'csv') {
    return { header: `${target.name}.csv`, body: toCsv(payload) };
  }
  return { header: `${target.name}.md`, body: toMarkdown(payload) };
};

export const write = async (rendered: Rendered): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(rendered.header);
    stream.write(rendered.body);
    stream.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
};

export const emit = async (payload: ReportPayload, target: DispatchTarget): Promise<void> => {
  const output = render(payload, target);
  await write(output);
};
