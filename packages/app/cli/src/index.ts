#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { InMemoryBus } from '@platform/messaging';
import { createEnvelope } from '@shared/protocol';

export const bootstrap = async (argv: string[]): Promise<number> => {
  const command = argv[2];
  if (!command) return 1;
  const bus = new InMemoryBus();
  const maybeFile = argv[3];

  const payload = command === 'emit-file'
    ? JSON.parse(await readFile(resolve(process.cwd(), maybeFile ?? 'config.json'), 'utf8').catch(() => Buffer.from('{}')).toString())
    : { command };

  await bus.publish('cli.events' as any, createEnvelope('cli.command', payload) as any);
  return 0;
};

if (typeof process !== 'undefined' && process.argv.includes('--run-cli')) {
  bootstrap(process.argv).catch(() => process.exit(1));
}
