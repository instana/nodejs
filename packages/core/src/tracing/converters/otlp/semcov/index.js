/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { BASE_OTLP } = require('./base-lookup');
const v123Overrides = require('./v123/lookup-overrides').LOOKUP_OVERRIDES;
const latestOverrides = require('./latest/lookup-overrides').LOOKUP_OVERRIDES;

function mergeDeltas(base, delta) {
  if (!delta) return { ...base };

  const res = { ...base };

  Object.keys(delta).forEach(key => {
    const deltaValue = delta[key];

    if (deltaValue && typeof deltaValue === 'object' && !Array.isArray(deltaValue)) {
      res[key] = mergeDeltas(base[key] || {}, deltaValue);
    } else {
      res[key] = deltaValue;
    }
  });

  return res;
}

/**
 * Exports complete lookups based on semantic version requirements
 * @param {string} version - '1.23' or 'latest'
 */
function getLookupConfig(version = '1.23') {
  if (version === '1.23') {
    return mergeDeltas(BASE_OTLP, v123Overrides);
  }

  return mergeDeltas(BASE_OTLP, latestOverrides);
}

module.exports = {
  getLookupConfig
};
