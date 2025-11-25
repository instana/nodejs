/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const shimmer = require('../../shimmer');
const hook = require('../../../util/hook');
const { getErrorDetails, getStackTrace } = require('../../tracingUtil');
const { EXIT } = require('../../constants');
const cls = require('../../cls');

let logger;
let isActive = false;

const providerAndDataSourceUriMap = new WeakMap();

exports.init = function init(config) {
  logger = config.logger;
  hook.onModuleLoad('@prisma/client', instrumentPrismaClient);
};

function instrumentPrismaClient(prismaClientModule) {
  instrumentClientConstructor(prismaClientModule);
  shimRequest(prismaClientModule);
}

function instrumentClientConstructor(prismaClientModule) {
  // Additionally instrument the constructor to get access to database URL and type.
  if (typeof prismaClientModule.PrismaClient === 'function') {
    class InstanaPrismaClient extends prismaClientModule.PrismaClient {
      constructor() {
        super(...arguments);

        // NOTE: Getting the url between 4.10 and 5.1 is not possible.
        //       Prisma did not backport the fix in 5.2
        //       https://github.com/prisma/prisma/compare/5.1.0...5.2.0
        // Works with @prisma/client < 4.10
        // In 4.10 `getConfig` got removed.
        // https://github.com/prisma/prisma/commit/30ebd6a21b180cea10320228e0392f2a5de670b6

        // Unfortunately, resolving the configuration is an asynchronous operation.
        // If the first model access happens in the same event loop iteration as creating the client, the span for that
        // Prisma operation will not have the provider or target URL available.
        if (this._engine && typeof this._engine.getConfig === 'function') {
          const configPromise = this._engine.getConfig();
          if (typeof configPromise.then === 'function') {
            configPromise.then(configResult => {
              if (!configResult || !Array.isArray(configResult.datasources)) {
                return;
              }
              const activeDatasource = configResult.datasources[0];
              if (!activeDatasource) {
                return;
              }

              // We store the provider and destination URL for the Prisma client instance. That way, when multiple
              // Prisma client's are used, we do not confuse providers/database URLs.
              const dataSourceUrlObject = activeDatasource.url;
              if (dataSourceUrlObject && dataSourceUrlObject.value) {
                providerAndDataSourceUriMap.set(this._engine, {
                  provider: activeDatasource.activeProvider,
                  dataSourceUrl: redactPassword(activeDatasource.activeProvider, dataSourceUrlObject.value)
                });
              } else if (dataSourceUrlObject && dataSourceUrlObject.fromEnvVar) {
                providerAndDataSourceUriMap.set(this._engine, {
                  provider: activeDatasource.activeProvider,
                  dataSourceUrl: redactPassword(
                    activeDatasource.activeProvider,
                    process.env[dataSourceUrlObject.fromEnvVar]
                  )
                });
              }
            });
          } else {
            logger.debug('[Instana] Cannot read engine config. Database url & provider will not be captured on spans.');
          }
        } else if (this._engineConfig) {
          // works for > 5.1
          const provider = this._engineConfig.activeProvider;
          let dataSourceUrl = '';

          // From v7 prisma client requires adapters.
          // For postgres adapters, the url can be found in either `connectionString` or  `externalPool`
          // TODO: Extend support for other types of adapters
          if (this._engineConfig.adapter) {
            const adapter = this._engineConfig.adapter;
            try {
              if (adapter?.config?.connectionString) {
                dataSourceUrl = redactPassword(provider, adapter.config.connectionString);
              } else if (adapter?.externalPool?.options?.connectionString) {
                dataSourceUrl = redactPassword(provider, adapter.externalPool.options.connectionString);
              }
            } catch (err) {
              logger.debug('[Instana] Cannot extract URL from Prisma adapter config:', err);
            }
          } else {
            try {
              const envVarName = this._engineConfig.inlineDatasources.db.url.fromEnvVar;
              dataSourceUrl = redactPassword(provider, process.env[envVarName]);
            } catch (err) {
              logger.debug('[Instana] Cannot read engine config. Database url will not be captured on spans.');
            }
          }

          try {
            providerAndDataSourceUriMap.set(this._engine, {
              provider,
              dataSourceUrl
            });
          } catch (err) {
            logger.debug('[Instana] Cannot read engine config. Database url & provider will not be captured on spans.');
          }
        } else {
          logger.debug('[Instana] Cannot read engine config. Database url & provider will not be captured on spans.');
        }
      }
    }
    prismaClientModule.PrismaClient = InstanaPrismaClient;
  }
}

function shimRequest(prismaClientModule) {
  if (
    !prismaClientModule ||
    !prismaClientModule.PrismaClient ||
    !prismaClientModule.PrismaClient.prototype ||
    !prismaClientModule.PrismaClient.prototype._request
  ) {
    logger.debug('prismaClientModule.PrismaClient.prototype._request does not exist, will not instrument Prisma.');
    return;
  }

  // The relevant source file is:
  // https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/getPrismaClient.ts
  shimmer.wrap(prismaClientModule.PrismaClient.prototype, '_request', instrumentRequest);
}

function instrumentRequest(original) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    const argsForOriginalRequest = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      argsForOriginalRequest[i] = arguments[i];
    }
    return instrumentedRequest(this, original, argsForOriginalRequest);
  };
}

function instrumentedRequest(ctx, originalRequest, argsForOriginalRequest) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: 'prisma',
      kind: EXIT
    });
    span.stack = getStackTrace(instrumentedRequest, 1);
    const params = argsForOriginalRequest[0] || {};

    const providerAndDataSourceUri = ctx._engine ? providerAndDataSourceUriMap.get(ctx._engine) || {} : {};
    span.data.prisma = {
      model: params.model,
      action: params.action,
      provider: providerAndDataSourceUri.provider,
      url: providerAndDataSourceUri.dataSourceUrl
    };
    const requestPromise = originalRequest.apply(ctx, argsForOriginalRequest);
    if (!requestPromise && typeof requestPromise.then !== 'function') {
      span.cancel();
      return requestPromise;
    } else {
      return requestPromise
        .then(value => {
          finishSpan(null, span);
          return value;
        })
        .catch(error => {
          finishSpan(error, span);
          return error;
        });
    }
  });
}

function redactPassword(provider, url) {
  if (typeof provider !== 'string' || typeof url !== 'string' || 'sqlite' === provider.toLowerCase()) {
    return url;
  }

  const isKnownProvider = ['cockroachdb', 'mongodb', 'mysql', 'postgresql', 'sqlserver'].includes(
    provider.toLowerCase()
  );

  if (!isKnownProvider) {
    // Prisma might add new providers in the future and we cannot know how the connection URLs are structured. To err on
    // the side of caution, we do not capture the datasource URL for unknown providers. We do not want to risk capturing
    // the DB password inadvertently.
    return null;
  }

  if ('sqlserver' === provider.toLowerCase()) {
    return redactPasswordFromMsSQLUrl(url);
  }

  // Parse standard datasource URI (basically everything except for MsSQL).
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl != null) {
      // We usually use <redacted> but the password is part of an URI and "<"/">" are invalid characters in URIs. We
      // might parse the URL later when processing the span in the back end and for that we need a valid URI.
      parsedUrl.password = '_redacted_';
    }
    return parsedUrl.toString();
  } catch (e) {
    // Return null if we cannot parse the URL. We should rather not capture any URL at all than running the risk of
    // capturing the DB password inadvertently.
    return null;
  }
}

// exported for testing
exports._redactPassword = redactPassword;

function redactPasswordFromMsSQLUrl(url) {
  // MSSQL datasource URLs look like this:
  // sqlserver://hostname:9876;database=database_name;user=username;password=secret;encrypt=true
  const matchResult = /(.*;\s*password\s*=\s*)[^;]*(.*)/i.exec(url);
  if (!matchResult) {
    return null;
  }
  return `${matchResult[1]}_redacted_${matchResult[2]}`;
}

function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    span.data.prisma.error = getErrorDetails(error);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
