/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const os = require('os');
const ctx = require('../context');
const { INSTRUMENTATION_SCOPE_NAME } = require('../constants');

let SDK_VERSION = '1.0.0';
try {
  // @ts-ignore
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

/**
 * @typedef {Object} RawPayload
 * @property {Record<string, any>} [data]
 * @property {Record<string, any>} [resource]
 * @property {Record<string, any>} [f]
 */

const resourceMapper = {
  /**
   * @param {RawPayload} rawPayload
   * @returns {string | undefined}
   */
  serviceName(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['service.name'] || ctx.serviceName;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {string}
   */
  sdkLanguage(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.language'] || SDK_LANGUAGE;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {string}
   */
  sdkName(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.name'] || SDK_NAME;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {string}
   */
  sdkVersion(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.version'] || SDK_VERSION;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {number | undefined}
   */
  processId(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    const metadata = rawPayload.f || {};

    const pid = resource['process.pid'] || metadata.e || ctx._pid;

    if (pid === null || pid === undefined) {
      return undefined;
    }

    const value = Number(pid);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {string | undefined}
   */
  hostName(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    let hostName = resource['host.name'];

    if (!hostName) {
      try {
        hostName = os.hostname();
      } catch (err) {
        // If os.hostname() fails, return undefined
        hostName = undefined;
      }
    }

    return typeof hostName === 'string' ? hostName : undefined;
  },

  /**
   * @param {RawPayload} rawPayload
   * @returns {string | undefined}
   */
  hostId(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    const metadata = rawPayload.f || {};

    const hostId = resource['host.id'] || metadata.h || ctx._hostId;

    return typeof hostId === 'string' ? hostId : undefined;
  }
};

/**
 * @param {RawPayload} rawPayload
 * @returns {{ attributes: Array<{ key: string, value: { intValue?: number, stringValue?: string } }> }}
 */
function extractResourceAttributes(rawPayload) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const OTLP = /** @type {any} */ (ctx.semConv);

  const resourceMappings = [
    {
      otlp: OTLP.resource.SERVICE_NAME,
      transform: resourceMapper.serviceName,
      valueType: 'string'
    },
    {
      otlp: OTLP.resource.SDK_LANGUAGE,
      transform: resourceMapper.sdkLanguage,
      valueType: 'string'
    },
    {
      otlp: OTLP.resource.SDK_NAME,
      transform: resourceMapper.sdkName,
      valueType: 'string'
    },
    {
      otlp: OTLP.resource.SDK_VERSION,
      transform: resourceMapper.sdkVersion,
      valueType: 'string'
    },
    {
      otlp: OTLP.resource.PROCESS_PID,
      transform: resourceMapper.processId,
      valueType: 'int'
    },
    {
      otlp: OTLP.resource.HOST_NAME,
      transform: resourceMapper.hostName,
      valueType: 'string'
    },
    {
      otlp: OTLP.resource.HOST_ID,
      transform: resourceMapper.hostId,
      valueType: 'string'
    }
  ];

  /** @type {Array<{ key: string, value: { intValue?: number, stringValue?: string } }>} */
  const attributes = resourceMappings.reduce((result, mapping) => {
    const value = mapping.transform(rawPayload);

    if (value !== undefined && value !== null) {
      result.push({
        key: mapping.otlp,
        value:
          mapping.valueType === 'int' ? { intValue: /** @type {number} */ (value) } : { stringValue: String(value) }
      });
    }

    return result;
  }, /** @type {Array<{ key: string, value: { intValue?: number, stringValue?: string } }>} */ ([]));

  return { attributes };
}

module.exports = {
  extractResourceAttributes,
  INSTRUMENTATION_SCOPE
};
