/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const glob = require('glob');

let instrumentationGroups = null;

/**
 * Discovers and caches instrumentation groups.
 *
 * @returns {Object.<string, string[]>}
 */
function getInstrumentationGroups() {
  if (instrumentationGroups) {
    return instrumentationGroups;
  }

  instrumentationGroups = {};

  const files = glob.sync('./instrumentation/**/*.js', {
    cwd: __dirname,
    ignore: [
      '**/index.js',
      '**/*_test.js',
      '**/captureHttpHeadersUtil.js',
      '**/aws_utils.js',
      '**/instana_aws_product.js'
    ]
  });

  files.forEach(filePath => {
    try {
      const instrumentation = require(filePath);

      if (!instrumentation.spanName) {
        return;
      }

      const group = filePath.split('/')[2];

      if (!instrumentationGroups[group]) {
        instrumentationGroups[group] = [];
      }

      instrumentationGroups[group].push(instrumentation.spanName);
    } catch (e) {
      // Ignore files that cannot be loaded
    }
  });

  // ✅ ONLY CHANGE: remove duplicates per group
  Object.keys(instrumentationGroups).forEach(group => {
    instrumentationGroups[group] = [...new Set(instrumentationGroups[group])];
  });

  return instrumentationGroups;
}

/**
 * Returns all span types for a group.
 *
 * @param {string} group
 * @returns {string[]}
 */
function getSpanTypesForGroup(group) {
  return getInstrumentationGroups()[group] || [];
}

/**
 * Returns the group for a span type.
 *
 * @param {string} spanType
 * @returns {string|null}
 */
function getGroupForSpanType(spanType) {
  const groups = getInstrumentationGroups();

  const group = Object.keys(groups).find(groupName => groups[groupName].includes(spanType));

  return group || null;
}

module.exports = {
  getInstrumentationGroups,
  getSpanTypesForGroup,
  getGroupForSpanType
};
