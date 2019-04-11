'use strict';

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('elasticsearch', instrument);
};

function instrument(es) {
  var OriginalClient = es.Client;

  es.Client = function InstrumentedClient() {
    var client = OriginalClient.apply(OriginalClient, arguments);
    var info = {};

    gatherClusterInfo(client, info);

    instrumentApi(client, 'search', info);
    instrumentApi(client, 'index', info);
    instrumentApi(client, 'get', info);
    instrumentApi(client, 'msearch', info);
    instrumentApi(client, 'mget', info);

    return client;
  };
}

function gatherClusterInfo(client, info) {
  client.info().then(
    function(_info) {
      info.clusterName = _info.cluster_name;
    },
    function() {
      setTimeout(function() {
        gatherClusterInfo(client, info);
      }, 30000).unref();
    }
  );
}

function instrumentApi(client, action, info) {
  var original = client[action];

  client[action] = function instrumentedAction(params, cb) {
    if (!isActive || !cls.isTracing()) {
      return original.apply(client, arguments);
    }

    var span = cls.startSpan('elasticsearch', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedAction);
    span.data = {
      elasticsearch: {
        action: action,
        cluster: info.clusterName
      }
    };

    if (action === 'mget' && params.body && params.body.docs && Array.isArray(params.body.docs)) {
      getSpanDataFromMget1(span, params.body.docs);
    } else if (action === 'mget' && params.body && params.body.ids && Array.isArray(params.body.ids)) {
      getSpanDataFromMget2(span, params);
    } else if (action === 'msearch' && Array.isArray(params.body)) {
      getSpanDataFromMsearch(span, params.body);
    } else {
      span.data.elasticsearch.index = toStringEsMultiParameter(params.index);
      span.data.elasticsearch.type = toStringEsMultiParameter(params.type);
      span.data.elasticsearch.stats = toStringEsMultiParameter(params.stats);
      span.data.elasticsearch.id = action === 'get' ? params.id : undefined;
      span.data.elasticsearch.query =
        action === 'search' ? tracingUtil.shortenDatabaseStatement(JSON.stringify(params)) : undefined;
    }

    cls.ns.bind(cb);

    if (arguments.length === 2) {
      return original.call(client, params, function(error, response) {
        if (error) {
          onError(error);
        } else {
          onSuccess(response);
        }

        return cb.apply(this, arguments);
      });
    }

    try {
      return original.call(client, params).then(onSuccess, function(error) {
        onError(error);
        throw error;
      });
    } catch (e) {
      // Immediately cleanup on synchronous errors.
      throw e;
    }

    function onSuccess(response) {
      if (response.hits != null && response.hits.total != null) {
        span.data.elasticsearch.hits = response.hits.total;
      } else if (response.responses != null && Array.isArray(response.responses)) {
        span.data.elasticsearch.hits = response.responses.reduce(function(hits, res) {
          return hits + (res.hits && typeof res.hits.total === 'number' ? res.hits.total : 0);
        }, 0);
      }
      span.d = Date.now() - span.ts;
      span.error = false;
      span.transmit();
      return response;
    }

    function onError(error) {
      span.d = Date.now() - span.ts;
      span.error = true;
      span.ec = 1;
      span.data.elasticsearch.error = tracingUtil.getErrorDetails(error);
      span.transmit();
    }
  };
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
  var indices = [];
  var types = [];
  var stats = [];
  var ids = [];
  for (var i = 0; i < docs.length; i++) {
    collectParamFrom(docs[i], '_index', indices);
    collectParamFrom(docs[i], '_type', types);
    collectParamFrom(docs[i], '_stats', stats);
    collectParamFrom(docs[i], '_id', ids);
  }
  span.data.elasticsearch.index = indices.length > 0 ? indices.join(',') : undefined;
  span.data.elasticsearch.type = types.length > 0 ? types.join(',') : undefined;
  span.data.elasticsearch.stats = stats.length > 0 ? stats.join(',') : undefined;
  span.data.elasticsearch.id = ids.length > 0 ? ids.join(',') : undefined;
}

function getSpanDataFromMget2(span, params) {
  span.data.elasticsearch.index = params.index ? toStringEsMultiParameter(params.index) : undefined;
  span.data.elasticsearch.type = params.index ? toStringEsMultiParameter(params.type) : undefined;
  span.data.elasticsearch.stats = params.index ? toStringEsMultiParameter(params.stats) : undefined;
  span.data.elasticsearch.id = params.body.ids.length > 0 ? params.body.ids.join(',') : undefined;
}

function getSpanDataFromMsearch(span, body) {
  var indices = [];
  var types = [];
  var stats = [];
  for (var i = 0; i < body.length; i++) {
    collectParamFrom(body[i], 'index', indices);
    collectParamFrom(body[i], 'type', types);
    collectParamFrom(body[i], 'stats', stats);
  }
  span.data.elasticsearch.index = indices.length > 0 ? indices.join(',') : undefined;
  span.data.elasticsearch.type = types.length > 0 ? types.join(',') : undefined;
  span.data.elasticsearch.stats = stats.length > 0 ? stats.join(',') : undefined;
}

function collectParamFrom(bodyItem, key, accumulator) {
  if (bodyItem && bodyItem[key]) {
    var value = toStringEsMultiParameter(bodyItem[key]);
    if (value != null && accumulator.indexOf(value) < 0) {
      accumulator.push(value);
    }
  }
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
