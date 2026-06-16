/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../context');
const { INSTRUMENTATION_SCOPE_NAME } = require('../../traces/mappers/constants');

let SDK_VERSION = '1.0.0';
try {
  SDK_VERSION = require('../../../../package.json').version || '1.0.0';
} catch (_) {
  // ignore
}

const SDK_LANGUAGE = 'nodejs';
const SDK_NAME = 'instana';

const INSTRUMENTATION_SCOPE = {
  name: INSTRUMENTATION_SCOPE_NAME,
  version: SDK_VERSION
};

const resourceMapper = {
  serviceName(rawPayload, mapper) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    return r.service_name || r['service.name'] || mapper?.resourceServiceName || ctx.serviceName;
  },

  sdkLanguage(rawPayload) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    return r.sdk_language || r['telemetry.sdk.language'] || SDK_LANGUAGE;
  },

  sdkName(rawPayload) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    return r.sdk_name || r['telemetry.sdk.name'] || SDK_NAME;
  },

  sdkVersion(rawPayload) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    return r.sdk_version || r['telemetry.sdk.version'] || SDK_VERSION;
  },

  processId(rawPayload) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    const metadata = rawPayload.f || null;
    const pid = r.process_pid || r['process.pid'] || metadata?.e || ctx.pid;

    if (pid === null || pid === undefined) return undefined;

    const value = Number(pid);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  },

  hostName(rawPayload) {
    const r = rawPayload.data?.resource || rawPayload.resource || {};
    const metadata = rawPayload.f || null;
    const hostName = r.host_name || r['host.name'] || metadata?.h || ctx.hostId;

    return hostName && typeof hostName === 'string' ? hostName : undefined;
  }
};

/**
 * @param {Object} rawPayload
 * @param {Object} [mapper]
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload, mapper) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const OTLP = ctx.semConv;

  const resourceMappings = [
    {
      otlp: OTLP.resource.SERVICE_NAME,
      transform: span => resourceMapper.serviceName(span, mapper),
      valueType: 'string'
    },
    { otlp: OTLP.resource.SDK_LANGUAGE, transform: resourceMapper.sdkLanguage, valueType: 'string' },
    { otlp: OTLP.resource.SDK_NAME, transform: resourceMapper.sdkName, valueType: 'string' },
    { otlp: OTLP.resource.SDK_VERSION, transform: resourceMapper.sdkVersion, valueType: 'string' },
    { otlp: OTLP.resource.PROCESS_PID, transform: resourceMapper.processId, valueType: 'int' },
    { otlp: OTLP.resource.HOST_NAME, transform: resourceMapper.hostName, valueType: 'string' }
  ];

  const attributes = resourceMappings.reduce((result, mapping) => {
    const value = mapping.transform(rawPayload);

    if (value !== null && value !== undefined) {
      result.push({
        key: mapping.otlp,
        value: mapping.valueType === 'int' ? { intValue: value } : { stringValue: String(value) }
      });
    }

    return result;
  }, []);

  return { attributes };
}

module.exports = {
  extractResourceAttributes,
  INSTRUMENTATION_SCOPE
};
