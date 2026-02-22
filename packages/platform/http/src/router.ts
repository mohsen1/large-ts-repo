import { RouteSpec, RouteHandler, RouterNode, OpenApiLike, RequestContext, ResponseContext, HttpServerConfig, HttpMethod, TypedRouteConfig } from './types';

export class Router {
  private readonly routes: RouteSpec<any, any>[] = [];

  add<Req, Res>(route: RouteSpec<Req, Res>): void {
    this.routes.push(route as RouteSpec<any, any>);
  }

  addTyped<Req, Res>(route: TypedRouteConfig<Req, Res>): void {
    this.routes.push({
      method: route.method,
      path: route.path,
      handler: async (ctx: RequestContext) => {
        const output = await route.handler(ctx.body as Req);
        return { status: 200, body: output, headers: {} };
      },
      parseBody: (input) => input as Req,
    });
  }

  async dispatch(path: string, method: HttpMethod, body: unknown): Promise<ResponseContext<unknown>> {
    const route = this.routes.find((item) => item.path === path && item.method === method);
    if (!route) {
      return { status: 404, body: { error: 'not_found' }, headers: {} };
    }
    const reqCtx: RequestContext = {
      method,
      path,
      params: {},
      query: {},
      headers: {},
      body,
    };
    const parsed = route.parseBody ? route.parseBody(reqCtx.body) : reqCtx.body;
    reqCtx.body = parsed;
    return route.handler(reqCtx);
  }

  openApi(): OpenApiLike {
    const paths: Record<string, Record<string, any>> = {};
    for (const route of this.routes) {
      paths[route.path] ??= {};
      paths[route.path][route.method.toLowerCase()] = {
        summary: `${route.method} ${route.path}`,
        request: route.parseBody ? {} : undefined,
      };
    }
    return { openapi: '3.0.0', paths };
  }

  dumpTree(): RouterNode[] {
    const nodes: RouterNode[] = [];
    for (const route of this.routes) {
      nodes.push({ path: route.path, children: [], methods: [route.method] });
    }
    return nodes;
  }
}

export async function simulate(config: HttpServerConfig, router: Router, calls: Array<{ path: string; method: HttpMethod; body: unknown }>): Promise<number> {
  let processed = 0;
  for (const call of calls) {
    const out = await router.dispatch(call.path, call.method, call.body);
    processed += out.status;
  }
  return processed;
}
