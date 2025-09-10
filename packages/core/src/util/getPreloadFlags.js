/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/** @type {import('../instanaCtr').InstanaCtrType} */
let instanaCtr;

/**
 * @param {import('../instanaCtr').InstanaCtrType} _instanaCtr
 */
exports.init = function init(_instanaCtr) {
  instanaCtr = _instanaCtr;
};

exports.get = () => {
  const flags = ['--require', '--import', '--experimental-loader'];

  /**
   * @param {string[]} optionArray
   */
  function extractOption(optionArray) {
    const relevantOptions = [];

    for (let i = 0; i < optionArray.length; i++) {
      if (flags.some(flag => optionArray[i].includes(flag))) {
        relevantOptions.push(`${optionArray[i]} ${optionArray[i + 1]}`);
        i++;
      }
    }

    return relevantOptions.join(', ');
  }

  try {
    let nodeOptions = '';
    if (process.env.NODE_OPTIONS) {
      const nodeOptionsArray = process.env.NODE_OPTIONS.split(' ');
      nodeOptions = extractOption(nodeOptionsArray);
    }

    let execArgs = '';
    if (process.execArgv.length > 0) {
      execArgs = extractOption(process.execArgv);
    }

    const result = [nodeOptions, execArgs].filter(Boolean).join(', ') || 'noFlags';
    return result;
  } catch (error) {
    instanaCtr.logger().error(`Error occurred while doing preload flag filtering: ${error?.message} ${error?.stack}`);
    return '';
  }
};
