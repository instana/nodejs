/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

exports.getPreloadFlags = function getPreloadFlags() {
  const flags = ['--require', '--import', '--experimental-loader'];

  /**
   * @param {string[]} optionArray
   */
  function extractOption(optionArray) {
    const relevantOptions = [];

    for (let i = 0; i < optionArray.length; i++) {
      if (flags.some(flag => optionArray[i].includes(flag))) {
        relevantOptions.push(`${optionArray[i]} ${optionArray[i + 1]}`);
        i++; // Skip the next element as it's already included
      }
    }

    return relevantOptions.join(', ');
  }

  // Check process.env.NODE_OPTIONS
  let nodeOptions = '';
  if (process.env.NODE_OPTIONS) {
    const nodeOptionsArray = process.env.NODE_OPTIONS.split(' ');
    nodeOptions = extractOption(nodeOptionsArray);
  }

  // Check process.execArgv
  let execArgs = '';
  if (process.execArgv.length > 0) {
    execArgs = extractOption(process.execArgv);
  }

  const result = [nodeOptions, execArgs].filter(Boolean).join(', ') || 'noFlags';
  return result;
};
