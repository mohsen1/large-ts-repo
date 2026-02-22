import { FastifyInstance } from 'fastify';
import { createEnvelope } from '@shared/protocol';
import { MessageBus } from '@platform/messaging';

export interface ApiContext {
  bus: MessageBus;
  busTopic: string;
}

export const createRoutes = (app: FastifyInstance, ctx: ApiContext) => {
  app.post('/v1/events', async (request, reply) => {
    const envelope = createEnvelope('http.events', request.body);
    await ctx.bus.publish(ctx.busTopic as any, envelope as any);
    reply.code(202).send({ accepted: true, topic: ctx.busTopic });
  });

  app.get('/v1/health', async (_, reply) => {
    reply.send({ status: 'ok', component: 'api-gateway' });
  });
};

export const mount = (app: FastifyInstance, ctx: ApiContext): FastifyInstance => {
  createRoutes(app, ctx);
  return app;
};
