/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getLookupConfig } = require('./semconv');

const DEFAULT_SEMCONV_VERSION = '1.23';

class OtlpConfigContext {
  constructor() {
    /** @type {Record<string, any> | null} */
    this._config = null;
    /** @type {string} */
    this._semConvVersion = DEFAULT_SEMCONV_VERSION;
    /** @type {any} */
    this._compiledSemConv = null;
    /** @type {string | null} */
    this._hostId = null;
    /** @type {string | null} */
    this._pid = null;
    /** @type {string | null} */
    this._serviceName = null;
  }

  /**
   * @param {Record<string, any>} config
   */
  init(config = {}) {
    this._config = config;
    this._semConvVersion = DEFAULT_SEMCONV_VERSION;
    this._compiledSemConv = getLookupConfig(this._semConvVersion);
    this._pid = String(process.pid);
    this._serviceName = config.serviceName || null;
  }

  get semConv() {
    // eslint-disable-next-line no-return-assign
    return this._compiledSemConv || (this._compiledSemConv = getLookupConfig(this._semConvVersion));
  }

  get semConvVersion() {
    return this._semConvVersion;
  }

  /**
   * @param {string} serviceName
   */
  setServiceName(serviceName) {
    if (!serviceName || this._serviceName === serviceName) {
      return;
    }
    this._serviceName = serviceName;
  }

  get serviceName() {
    return this._serviceName;
  }
}

module.exports = new OtlpConfigContext();
