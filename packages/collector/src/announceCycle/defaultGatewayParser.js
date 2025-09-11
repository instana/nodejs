/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const fs = require('fs').promises;

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/** @type string */
let cachedResult;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * Parses the /proc/self/net/route and returns the default gateway IP. The result of the first invocation is cached,
 * subsequent calls will always yield the same result without attempting to parse the file again.
 *
 * @return {Promise<string>} the default gateway IP
 */
exports.parseProcSelfNetRouteFile = async function parseProcSelfNetRouteFile() {
  if (cachedResult !== undefined) {
    logger.debug(`Returning cached result for default gateway: ${cachedResult}.`);
    return cachedResult;
  }
  return exports._parseFile('/proc/self/net/route');
};

/**
 * Parses the given file and returns the default gateway IP.
 *
 * @param {string} filename - the name of the file to parse
 * @return {Promise<string>} the default gateway IP
 */
// exported for testing
exports._parseFile = async function _parseFile(filename) {
  let fileContent;
  try {
    fileContent = await fs.readFile(filename, { encoding: 'utf8' });
  } catch (e) {
    cachedResult = null;
    logger.debug(
      `Could not open ${filename} when trying to retrieve the default gateway IP. ${e?.message} ${e?.stack}`
    );
    if (e.code === 'ENOENT') {
      throw new Error(`Failed to determine the default gateway: The file ${filename} does not exist`);
    } else {
      throw new Error(`Failed to determine the default gateway, could not open the file ${filename}: ${e.message}`);
    }
  }

  logger.debug(`Successfully opened ${filename} for reading to determine the default gateway IP.`);
  // eslint-disable-next-line no-restricted-syntax
  for (const line of fileContent.split('\n')) {
    const fields = line.split('\t');
    if (exports._isDefaultGatewayLine(fields)) {
      logger.debug(`Parsing this line in ${filename} to retrieve the default gateway IP: ${line}`);
      cachedResult = exports._convertToIp(fields);
      logger.debug(`Determined the default gateway IP: ${cachedResult}`);
      return cachedResult;
    }
    logger.debug(`Ignoring this line in ${filename}, this does not seem to be the default gateway line: ${line}`);
  }

  logger.debug(`There seems to be no matching line in ${filename} to determine the default gateway IP.`);
  cachedResult = null;
  return cachedResult;
};

/**
 * Determines whether the given line from /proc/self/net/route is the one containing the default gateway IP.
 *
 * @param {string[]} fields - the line, already broken down into an array of strings after splitting at the tab characer
 * @return {boolean} true if and only if the line matches the pattern for the default gateway IP
 */
// exported for testing
exports._isDefaultGatewayLine = function _isDefaultGatewayLine(fields) {
  return fields.length >= 3 && fields[1] === '00000000' && fields[2].length === 8;
};

/**
 * Converts the fields from the line into an IP address.
 *
 * @param {string[]} fields - the line, already broken down into an array of strings after splitting at the tab characer
 * @return {string} the default gateway IP
 */
// exported for testing
exports._convertToIp = function _convertToIp(fields) {
  const hex = fields[2];
  return `${parseOctet(hex, 6)}.${parseOctet(hex, 4)}.${parseOctet(hex, 2)}.${parseOctet(hex, 0)}`;
};

/**
 * Extracts one IP octed from the string found in /proc/self/net/route.
 *
 * @param {string} ipAsHexString - the IP in the hex string notation used in /proc/self/net/route, that is, four
 * consecutive two character hex strings, in reverse order
 * @param {number} startIndex - the index to start parsing from, the function will read the character at that index and
 * the following character
 * @return {number} the parsed octet or NaN
 */
function parseOctet(ipAsHexString, startIndex) {
  return parseInt(ipAsHexString.substring(startIndex, startIndex + 2), 16);
}
