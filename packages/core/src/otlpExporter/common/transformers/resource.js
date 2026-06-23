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

const resourceMapper = {
  /**
   * @param {{ data: { resource: any; }; resource: any; }} rawPayload
   */
  serviceName(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['service.name'] || ctx.serviceName;
  },

  /**
   * @param {{ data: { resource: any; }; resource: any; }} rawPayload
   */
  sdkLanguage(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.language'] || SDK_LANGUAGE;
  },

  /**
   * @param {{ data: { resource: any; }; resource: any; }} rawPayload
   */
  sdkName(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.name'] || SDK_NAME;
  },

  /**
   * @param {{ data: { resource: any; }; resource: any; }} rawPayload
   */
  sdkVersion(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    return resource['telemetry.sdk.version'] || SDK_VERSION;
  },

  /**
   * @param {{ data: { resource: any; }; resource: any; f: {}; }} rawPayload
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
   * @param {{ data: { resource: any; }; resource: any; f: {}; }} rawPayload
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
   * @param {{ data: { resource: any; }; resource: any; f: {}; }} rawPayload
   */
  hostId(rawPayload) {
    const resource = rawPayload.data?.resource || rawPayload.resource || {};
    const metadata = rawPayload.f || {};

    const hostId = resource['host.id'] || metadata.h || ctx.hostId;

    return typeof hostId === 'string' ? hostId : undefined;
  }
};

/**
 * @param {Object} rawPayload
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const OTLP = ctx.semConv;

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

  const attributes = resourceMappings.reduce((result, mapping) => {
    const value = mapping.transform(rawPayload);

    if (value !== undefined && value !== null) {
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
