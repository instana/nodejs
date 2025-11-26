/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const url = require('url');
const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');
const methodToActionRegex = /^(\w+?)(?:Api)?\.(?:.+) \[as (\w+)\]$/;
const endpointToIdRegex = /^\/[^/]+\/_doc\/([^/]+)$/;

let logger;
let isActive = false;

exports.spanName = 'elasticsearch';
exports.batchable = true;

exports.init = function init(config) {
  logger = config.logger;
  hook.onModuleLoad('@elastic/elasticsearch', instrument);
};

const connectionUrlCache = {};

function instrument(es, esModuleFilename) {
  // v8
  if (es.SniffingTransport) {
    const OriginalClient = es.Client;
    es.Client = function InstanaClient() {
      const client = new OriginalClient(...arguments);

      if (client.connectionPool && client.connectionPool.connections && client.connectionPool.connections.length > 0) {
        const connectionString = client.connectionPool.connections[0].url;
        // We will almost certainly need the host and port from the connection URL later in shimGetConnection when
        // capturing an actual request. We can as well parse it now and put it in the cache.
        parseAndCacheConnectionUrl(connectionString);
      }

      return client;
    };

    instrumentTransport(es);
  } else {
    const ESAPI = tracingUtil.requireModuleFromApplicationUnderMonitoringSafely(esModuleFilename, '..', 'api');

    if (isConstructor(ESAPI)) {
      instrumentTransport(es);
    } else {
      instrumentApiLayer(es, ESAPI);
    }
  }
}

function instrumentApiLayer(es, ESAPI) {
  const OriginalClient = es.Client;
  if (!OriginalClient || typeof OriginalClient !== 'function') {
    return;
  }

  const actionPaths = [];
  forEachApiAction(ESAPI, actionPath => {
    actionPaths.push(actionPath);
  });

  es.Client = function InstrumentedClient() {
    const client = new OriginalClient(...arguments);

    const clusterInfo = {};
    gatherClusterInfo(client, clusterInfo);
    actionPaths.forEach(actionPath => {
      instrumentApi(client, actionPath, clusterInfo);
    });
    return client;
  };
}

function gatherClusterInfo(client, clusterInfo) {
  client.info().then(
    _clusterInfo => {
      if (_clusterInfo && _clusterInfo.body) {
        clusterInfo.clusterName = _clusterInfo.body.cluster_name;
      }
    },
    () => {
      setTimeout(() => {
        gatherClusterInfo(client, clusterInfo);
      }, 60000).unref();
    }
  );
}

function instrumentApi(client, actionPath, clusterInfo) {
  const action = actionPath.join('.');
  const parent = getParentByPath(action, client, actionPath);
  const originalFunction = getByPath(action, client, actionPath);

  if (!parent || typeof originalFunction !== 'function') {
    return;
  }

  parent[actionPath[actionPath.length - 1]] = function instrumentedAction(params, options, originalCallback) {
    if (cls.skipExitTracing({ isActive })) {
      return originalFunction.apply(this, arguments);
    }

    let callbackIndex = typeof originalCallback === 'function' ? 2 : -1;
    options = options || {};
    if (typeof options === 'function') {
      originalCallback = options;
      options = {};
      callbackIndex = 1;
    }
    if (typeof params === 'function' || params == null) {
      originalCallback = params;
      params = {};
      options = {};
      callbackIndex = 0;
    }

    const ctx = this;
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: exports.spanName,
        kind: constants.EXIT
      });
      span.stack = tracingUtil.getStackTrace(instrumentedAction);
      span.data.elasticsearch = {
        action,
        cluster: clusterInfo.clusterName
      };

      processParams(span, params);

      if (callbackIndex >= 0) {
        originalArgs[callbackIndex] = cls.ns.bind(function (error, result) {
          if (error) {
            onError(span, error);
          } else {
            onSuccess(span, result);
          }
          return originalCallback.apply(this, arguments);
        });
        return originalFunction.apply(ctx, originalArgs);
      } else {
        // eslint-disable-next-line no-useless-catch
        try {
          return originalFunction.apply(ctx, originalArgs).then(onSuccess.bind(null, span), error => {
            onError(span, error);
            throw error;
          });
        } catch (e) {
          // Immediately cleanup on synchronous errors.
          throw e;
        }
      }
    });
  };
}

function onSuccess(span, result) {
  const hits = (result.body && result.body.hits) || result.hits;
  const responses = (result.body && result.body.responses) || result.responses;

  if (hits != null && hits.total != null) {
    if (typeof hits.total === 'number') {
      span.data.elasticsearch.hits = hits.total;
    } else if (typeof hits.total.value === 'number') {
      span.data.elasticsearch.hits = hits.total.value;
    }
  } else if (responses != null && Array.isArray(responses)) {
    span.data.elasticsearch.hits = responses.reduce((h, res) => {
      if (res.hits && typeof res.hits.total === 'number') {
        return h + res.hits.total;
      } else if (res.hits && res.hits.total && typeof res.hits.total.value === 'number') {
        return h + res.hits.total.value;
      }
      return h;
    }, 0);
  }

  getConnectionDetailsFromResultMeta(span, result);
  span.d = Date.now() - span.ts;

  span.transmit();
  return result;
}

function onError(span, error) {
  span.d = Date.now() - span.ts;
  span.ec = 1;
  if (error) {
    tracingUtil.setErrorStack(span, error, 'elasticsearch');
  }
  if (error.meta && error.meta.meta) {
    getConnectionDetailsFromResultMeta(span, error.meta);
  }
  span.transmit();
}

function parseAndCacheConnectionUrl(connectionUrl) {
  if (connectionUrl && connectionUrl instanceof url.URL) {
    // The connection URL is already in the form of a URL object. No need to parse it.
    return connectionUrl;
  } else if (typeof connectionUrl === 'string') {
    // The connection URL is only available as a string. We need to parse it to extract the host and the port.

    // Deliberately checking for undefined, since we store a failure to parse an URL as null.
    if (connectionUrlCache[connectionUrl] !== undefined) {
      return connectionUrlCache[connectionUrl];
    }
    try {
      const parsedConnectionUrl = new URL(connectionUrl);
      // We do not want to spend the CPU cycles to parse the URL for each ES request. When we have parsed a given URL
      // once, we cache the resulting result and never parse that particular URL again.
      connectionUrlCache[connectionUrl] = parsedConnectionUrl;
      return parsedConnectionUrl;
    } catch (e) {
      // We also cache the fact that we failed to parse a given URL, otherwise we would try to parse it again on every
      // request.
      connectionUrlCache[connectionUrl] = null;
      return null;
    }
  }
}

function getConnectionDetailsFromResultMeta(span, result) {
  if (span.data.elasticsearch.address) {
    // We have already annotated the connection details, probably via shimGetConnection, no need to deal with connection
    // details again for this span.
    return;
  }

  // NOTE: This does not work for version 8.

  // Result can also be a part of the error object, both have the meta.connection attribute.
  // For the error object it is in error.meta.meta.connection (see onError).
  if (!span.data.elasticsearch.cluster && !span.data.elasticsearch.address && result.meta && result.meta.connection) {
    const connectionUrl = result.meta.connection.url;
    if (connectionUrl && connectionUrl instanceof url.URL) {
      span.data.elasticsearch.address = connectionUrl.hostname;
      span.data.elasticsearch.port = connectionUrl.port;
    }
  }
}

function processParams(span, params) {
  const action = span.data.elasticsearch.action;
  const body = (params && params.body) || (params && params.bulkBody);

  if (action === 'mget' && body && body.docs && Array.isArray(body.docs)) {
    getSpanDataFromMget1(span, body.docs);
  } else if (action === 'mget' && body && body.ids && Array.isArray(body.ids)) {
    getSpanDataFromMget2(span, params);
  } else if (action === 'msearch' && Array.isArray(body)) {
    getSpanDataFromMsearch(span, body);
  } else {
    span.data.elasticsearch.index = toStringEsMultiParameter(params.index);
    span.data.elasticsearch.type = toStringEsMultiParameter(params.type);
    span.data.elasticsearch.id = params.id;

    if (action && action.indexOf('search') === 0) {
      span.data.elasticsearch.query = tracingUtil.shortenDatabaseStatement(JSON.stringify(params));
    }
  }
}
function toStringEsMultiParameter(param) {
  if (param == null) {
    return undefined;
  }

  if (typeof param === 'string') {
    if (param === '') {
      return '_all';
    }
    return param;
  } else if (Array.isArray(param)) {
    return param.join(',');
  }

  return JSON.stringify(param);
}

function getSpanDataFromMget1(span, docs) {
  const indices = [];
  const types = [];
  const ids = [];
  for (let i = 0; i < docs.length; i++) {
    collectParamFrom(docs[i], '_index', indices);
    collectParamFrom(docs[i], '_type', types);
    collectParamFrom(docs[i], '_id', ids);
  }
  span.data.elasticsearch.index = indices.length > 0 ? indices.join(',') : undefined;
  span.data.elasticsearch.type = types.length > 0 ? types.join(',') : undefined;
  span.data.elasticsearch.id = ids.length > 0 ? ids.join(',') : undefined;
}

function getSpanDataFromMget2(span, params) {
  if (!params) {
    return;
  }
  const body = (params && params.body) || (params && params.bulkBody);
  span.data.elasticsearch.index = params.index ? toStringEsMultiParameter(params.index) : undefined;
  span.data.elasticsearch.type = params.index ? toStringEsMultiParameter(params.type) : undefined;
  span.data.elasticsearch.id = body && body.ids.length > 0 ? body.ids.join(',') : undefined;
}

function getSpanDataFromMsearch(span, body) {
  const indices = [];
  const types = [];
  const query = [];
  for (let i = 0; i < body.length; i++) {
    collectParamFrom(body[i], 'index', indices);
    collectParamFrom(body[i], 'type', types);
    collectParamFrom(body[i], 'query', query);
  }
  span.data.elasticsearch.index = indices.length > 0 ? indices.join(',') : undefined;
  span.data.elasticsearch.type = types.length > 0 ? types.join(',') : undefined;
  span.data.elasticsearch.query = query.length > 0 ? tracingUtil.shortenDatabaseStatement(query.join(',')) : undefined;
}

function collectParamFrom(bodyItem, key, accumulator) {
  if (bodyItem && bodyItem[key]) {
    const value = toStringEsMultiParameter(bodyItem[key]);
    if (value != null && accumulator.indexOf(value) < 0) {
      accumulator.push(value);
    }
  }
}

function instrumentTransport(es) {
  // Starting with 7.9.1, the export of @elastic/elasticsearch/api expects to be called as a constructor. In fact,
  // @elastic/elasticsearch#Client now inherits from @elastic/elasticsearch/api. See
  // https://github.com/elastic/elasticsearch-js/commit/a064f0f357ea5797cb8a784671b85a6b0c88626d and
  // https://github.com/elastic/elasticsearch-js/pull/1314 for details. Also, starting with that version, some API
  // methods are added via Object.defineProperties with the default settings and only a getter, making it impossible
  // to override/wrap them. For those versions we fall back to instrumenting the transport layer instead of the API.
  if (es.Transport && es.Transport.prototype) {
    shimmer.wrap(es.Transport.prototype, 'request', shimRequest);
    shimmer.wrap(es.Transport.prototype, 'getConnection', shimGetConnection);
  } else {
    logger.error(
      'Cannot instrument @elastic/elasticsearch. Either es.Transport or es.Transport.prototype does not exist.'
    );
  }
}

// Transport#request calls Transport#getConnection internally to determine which connection to use. That is,
// Transport#getConnection is called while the Elasticsearch exit span is active, and we can use it to capture the
// connection details.
function shimGetConnection(originalGetConnection) {
  return function () {
    const connectionInfo = originalGetConnection.apply(this, arguments);
    if (connectionInfo && connectionInfo.url) {
      const span = cls.getCurrentSpan();
      if (span && span.n === 'elasticsearch') {
        const parsedConnectionUrl = parseAndCacheConnectionUrl(connectionInfo.url);
        if (parsedConnectionUrl) {
          span.data.elasticsearch.address = parsedConnectionUrl.hostname;
          span.data.elasticsearch.port = parsedConnectionUrl.port;
        }
      }
    }
    return connectionInfo;
  };
}

function shimRequest(esReq) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return esReq.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedRequest(this, esReq, originalArgs);
  };
}

function instrumentedRequest(ctx, origEsReq, originalArgs) {
  // normalize arguments
  let params = originalArgs[0] || {};
  const options = originalArgs[1];
  let callbackIndex = 2;
  let originalCallback = originalArgs[callbackIndex];

  if (typeof originalCallback !== 'function') {
    if (typeof options === 'function') {
      callbackIndex = 1;
      originalCallback = originalArgs[callbackIndex];
    } else if (typeof params === 'function') {
      callbackIndex = 0;
      originalCallback = originalArgs[callbackIndex];
      params = {};
    } else {
      callbackIndex = -1;
      originalCallback = null;
    }
  }
  const httpPath = params.path;

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(instrumentedRequest, 1);
    span.data.elasticsearch = {
      endpoint: httpPath
    };

    findActionInStack(span);
    processParams(span, params);
    parseIdFromPath(span, httpPath);

    const q = params.querystring;
    if (q) {
      if (typeof q === 'string') {
        span.data.elasticsearch.query = tracingUtil.shortenDatabaseStatement(q);
      } else if (typeof q === 'object' && Object.keys(q).length > 0) {
        span.data.elasticsearch.query = tracingUtil.shortenDatabaseStatement(JSON.stringify(q));
      }
    }

    if (callbackIndex >= 0) {
      originalArgs[callbackIndex] = cls.ns.bind(function (error, result) {
        if (error) {
          onError(span, error);
        } else {
          onSuccess(span, result);
        }
        return originalCallback.apply(this, arguments);
      });
      return origEsReq.apply(ctx, originalArgs);
    } else {
      // eslint-disable-next-line no-useless-catch
      try {
        return origEsReq.apply(ctx, originalArgs).then(onSuccess.bind(null, span), error => {
          onError(span, error);
          throw error;
        });
      } catch (e) {
        // Immediately cleanup on synchronous errors.
        throw e;
      }
    }
  });
}

function findActionInStack(span) {
  if (!span.stack) {
    return;
  }
  const esApiFrames = span.stack.filter(frame => frame.c && frame.c.includes('/api'));
  if (esApiFrames.length === 0) {
    return;
  }
  const esApiMethod = esApiFrames[esApiFrames.length - 1].m;
  if (!esApiMethod) {
    return;
  }
  const matchResult = methodToActionRegex.exec(esApiMethod);
  if (matchResult) {
    if (matchResult[1] === 'Client') {
      // Top level API methods directly on Client, like `Client.indexApi [as index]`:
      span.data.elasticsearch.action = `${matchResult[2].toLowerCase()}`;
    } else {
      // Nested API, like `IndicesApi.indicesRefreshApi [as refresh]`:
      span.data.elasticsearch.action = `${matchResult[1].toLowerCase()}.${matchResult[2].toLowerCase()}`;
    }
  } else {
    // fall back: use the full method name
    span.data.elasticsearch.action = esApiMethod;
  }
}

function parseIdFromPath(span, httpPath) {
  if (httpPath) {
    const matchResult = endpointToIdRegex.exec(httpPath);
    if (matchResult) {
      span.data.elasticsearch.id = matchResult[1];
    }
  }
}

function forEachApiAction(ESAPI, fn) {
  const esApiFromBuildApi = ESAPI({
    makeRequest: function dummyMakeRequest() {},
    ConfigurationError: function DummyConfigurationError() {},
    result: {}
  });
  forEachKeyRecursive(esApiFromBuildApi, [], fn);
}

function forEachKeyRecursive(obj, path, fn) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  let hadSubKeys = false;
  Object.keys(obj).forEach(key => {
    const nextPath = path.concat(key);
    hadSubKeys = forEachKeyRecursive(obj[key], nextPath, fn);
    if (!hadSubKeys) {
      fn(nextPath);
    }
  });
  return true;
}

function getByPath(action, obj, path) {
  if (path.length === 0) {
    return obj;
  }
  return getByPath(action, obj[path[0]], path.slice(1));
}

function getParentByPath(action, obj, path) {
  if (path.length === 1) {
    return obj;
  }
  return getParentByPath(action, obj[path[0]], path.slice(1));
}

function isConstructor(ESAPI) {
  return ESAPI && typeof ESAPI.toString === 'function' && ESAPI.toString().includes('this[');
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
