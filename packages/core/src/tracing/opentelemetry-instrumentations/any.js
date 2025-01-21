/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

// TODO: optimize so that we will always find the class
const findClass = obj => {
  return (
    Object.keys(obj).find(
      key => typeof obj[key] === 'function' && obj[key].prototype && key.includes('Instrumentation')
    ) || null
  );
};

module.exports.init = (cls, value) => {
  try {
    const resp = require(value.pkg);
    const targetClassName = findClass(resp);

    if (!targetClassName) {
      return;
    }

    const instrumentation = new resp[targetClassName]();

    if (!instrumentation.getConfig().enabled) {
      instrumentation.enable();
    }
  } catch (e) {
    // ignore
  }
};

module.exports.getKind = otelSpan => {
  const kind = constants.EXIT;
  return kind;
};
