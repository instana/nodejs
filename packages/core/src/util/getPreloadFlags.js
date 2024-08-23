/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

exports.getPreloadFlags = function getPreloadFlags() {
  const flags = ['--require', '--import', '--experimental-loader'];
  const instanaKeyword = '@instana';

  // Function to find the matching flag along with '@instana' keyword
  /**
    * @param {string | string[]} option
  */
  function findFlagWithInstana(option) {
    return flags.find(flag => option.includes(flag) && option.includes(instanaKeyword));
  }

  if (process.env.NODE_OPTIONS) {
    const foundFlag = findFlagWithInstana(process.env.NODE_OPTIONS);
    if (foundFlag) {
      return foundFlag;
    }
  }

  if (process.execArgv.length > 0) {
    const foundFlag = findFlagWithInstana(process.execArgv?.join(' '));
    if (foundFlag) {
      return foundFlag;
    }
  }

  return 'noFlags';
};
