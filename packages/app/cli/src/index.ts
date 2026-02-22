#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parse } from 'node:path';
import { InMemoryBus } from '@platform/messaging';
import { createEnvelope } from '@shared/protocol';

export const bootstrap = async (argv: string[]): Promise<number> => {
  const command = argv[2];
  if (!command) return 1;
  const bus = new InMemoryBus();

  const payload = command === 'emit-file'
    ? JSON.parse(await readFile(parse(process.cwd()), 'utf8').catch(() => Buffer.from('{}')).toString())
    : { command };

  await bus.publish('cli.events' as any, createEnvelope('cli.command', payload) as any);
  return 0;
};

if (typeof process !== 'undefined' && process.argv.includes('--run-cli')) {
  bootstrap(process.argv).catch(() => process.exit(1));
}
