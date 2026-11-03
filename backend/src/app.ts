import { clerkPlugin, type ClerkFastifyOptions } from '@clerk/fastify';
import Fastify from 'fastify';
import {
  registerApiRoutes,
  RequestValidationError,
  type ApiDependencies,
} from './api/routes.js';
import { AnalysisTargetAccessError } from './analysisTargets/analysisTargetRepository.js';
import { AnalysisTargetValidationError } from './analysisTargets/analysisTargetValidation.js';
import { IngestionError } from './ingestion/ingestionService.js';

export interface BuildAppOptions {
  clerk?: ClerkFastifyOptions;
  api?: ApiDependencies;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.decorateRequest('authenticationContext', null);
  app.register(clerkPlugin, options.clerk ?? {});

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AnalysisTargetValidationError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        issues: error.issues,
      });
    }

    if (
      error instanceof AnalysisTargetAccessError ||
      error instanceof RequestValidationError ||
      error instanceof IngestionError
    ) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'An unexpected error occurred.' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  if (options.api) {
    app.register(async (api) => registerApiRoutes(api, options.api!), {
      prefix: '/api',
    });
  }

  return app;
}
