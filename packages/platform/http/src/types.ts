import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestContext<TPath = Record<string, string>, TQuery = Record<string, string>> {
  method: HttpMethod;
  path: string;
  params: TPath;
  query: TQuery;
  headers: Record<string, string>;
  body: unknown;
}

export interface ResponseContext<T> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export interface RouteSpec<Req, Res> {
  method: HttpMethod;
  path: string;
  handler: (ctx: RequestContext) => Promise<ResponseContext<Res>>;
  parseBody?: (input: unknown) => Req;
}

export interface RouterNode {
  path: string;
  children: RouterNode[];
  methods: readonly HttpMethod[];
}

export interface OpenApiLike {
  openapi: '3.0.0';
  paths: Record<string, Record<string, { summary?: string; request?: unknown; responses?: unknown }>>;
}

export type RouteHandler<TReq, TRes> = (req: TReq) => Promise<TRes>;

export interface TypedRouteConfig<TReq, TRes> {
  name: string;
  method: HttpMethod;
  path: string;
  schema: {
    request?: typeof z;
    response?: typeof z;
  };
  handler: RouteHandler<TReq, TRes>;
}

export interface HttpServerConfig {
  port: number;
  healthPath: string;
}
