import { TraceContext } from '@domain/observability-core/traces';

export interface GatewayRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  trace?: TraceContext;
}

export interface GatewayResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface Gateway {
  handle(req: GatewayRequest): Promise<GatewayResponse>;
}

export class NoopGateway implements Gateway {
  async handle(req: GatewayRequest): Promise<GatewayResponse> {
    return { status: 200, body: { ok: true, path: req.path }, headers: {} };
  }
}

