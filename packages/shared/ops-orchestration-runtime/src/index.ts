export * from './domain.js';
export * from './registry.js';
export * from './topology.js';
export * from './telemetry.js';
export * from './validation.js';
export * from './runner.js';

import { parseRuntimeRecord, DEFAULT_RECORD } from './validation.js';
import { OrchestrationRuntimeConfig } from './domain.js';

export const DEFAULT_RUNTIME_RECORD = await parseRuntimeRecord(DEFAULT_RECORD);
export const DEFAULT_RUNTIME_CONFIG: OrchestrationRuntimeConfig = DEFAULT_RUNTIME_RECORD.config;

export const ORCHESTRATION_PHASES = DEFAULT_RUNTIME_RECORD.phases;
