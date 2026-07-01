/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {any} str
 * @returns {string}
 */
function toUpperCase(str) {
  return typeof str === 'string' ? str.toUpperCase() : '';
}

/**
 * @param {any[] | any} values
 * @returns {any}
 */
function firstDefined(values) {
  if (!Array.isArray(values)) {
    return values != null ? values : undefined;
  }
  return values.find(v => v != null);
}

/**
 * @param {any[]} values
 * @returns {string}
 */
function joinWith(values) {
  return values.filter(v => v != null).join(':');
}

/**
 * @param {Record<string, any>} data
 * @param {string[]} keys
 * @returns {string}
 */
function combineFields(data, keys) {
  if (!data || !Array.isArray(keys)) return '';
  /** @type {any[]} */
  const parts = [];
  keys.forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      parts.push(data[key]);
    }
  });
  return parts.join('.');
}

/**
 * @param {any} value
 * @returns {{ stringValue?: string, intValue?: number, doubleValue?: number, boolValue?: boolean }}
 */
function formatOTLPValue(value) {
  const type = typeof value;
  if (type === 'string') return { stringValue: value };
  if (type === 'number') {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  if (type === 'boolean') return { boolValue: value };
  if (type === 'object' && value !== null) return { stringValue: JSON.stringify(value) };
  return { stringValue: String(value) };
}

/**
 * @param {string | URL} connection
 * @returns {{ host?: string, port?: number }}
 */
function parseConnection(connection) {
  if (!connection) {
    return {};
  }

  try {
    const connectionStr = typeof connection === 'string' ? connection : connection.toString();
    const url = new URL(connectionStr.includes('://') ? connectionStr : `http://${connectionStr}`);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined
    };
  } catch {
    return {};
  }
}

/**
 * @param {string | URL} connection
 * @returns {string | undefined}
 */
const extractHost = connection => parseConnection(connection).host;

/**
 * @param {string | URL} connection
 * @returns {number | undefined}
 */
const extractPort = connection => parseConnection(connection).port;

/**
 * @param {string } value
 * @param { Record<string, any> } data
 * @returns {string}
 */
const getRPCMethod = (value, data) => {
  if (data?.flavor === 'grpc' && typeof value === 'string') {
    // Recognized methods have format "ServiceName/MethodName" (no dots in service name)
    // Unrecognized methods have format "package.name.ServiceName/MethodName"
    const parts = value.split('/');
    if (parts.length === 2 && parts[0].includes('.')) {
      // Unrecognized method - has package prefix with dots
      return '_OTHER';
    }
  }
  return value;
};

/**
 * @param {string} value
 * @param { Record<string, any> } data
 * @returns {string | undefined}
 */
const getRPCMethodOriginal = (value, data) => {
  // Only set method_original for unrecognized gRPC methods
  if (data?.flavor === 'grpc' && typeof value === 'string') {
    const parts = value.split('/');
    if (parts.length === 2 && parts[0].includes('.')) {
      // Unrecognized method - return original value
      return value;
    }
  }
  // For recognized methods or non-gRPC, don't set method_original
  return undefined;
};

/**
 * @param {string | boolean} value
 * @returns {boolean | undefined}
 */
const toBoolean = value => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return undefined;
};

/**
 * @param {string } arn
 * @param {number } index
 * @returns {string | undefined}
 */
const getArnPart = (arn, index) => {
  // arn:aws:lambda:{region}:{account-id}:function:{name}:{version}
  if (typeof arn !== 'string') {
    return undefined;
  }

  return arn.split(':')[index] || undefined;
};

/**
 * @param {string } arn
 * @returns {string | undefined}
 */
const getRegionFromArn = arn => getArnPart(arn, 3);

/**
 * @param {string } arn
 * @returns {string | undefined}
 */
const getAccountIdFromArn = arn => getArnPart(arn, 4);

module.exports = {
  toUpperCase,
  firstDefined,
  joinWith,
  combineFields,
  formatOTLPValue,
  extractHost,
  extractPort,
  getRPCMethod,
  getRPCMethodOriginal,
  toBoolean,
  getRegionFromArn,
  getAccountIdFromArn
};
