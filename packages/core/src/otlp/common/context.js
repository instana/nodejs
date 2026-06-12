/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getLookupConfig } = require('./semconv');

class OtlpConfigContext {
  constructor() {
    this._config = null;
    this._semConvVersion = '1.23';
    this._compiledSemConv = null;
    this._hostId = null;
    this._pid = null;
    this._serviceName = null;
  }

  /**
   * @param {Object} config
   */
  init(config = {}) {
    this._config = config;
    // future value in config semConvVersion
    this._semConvVersion = config?.semConvVersion || '1.23';
    this._compiledSemConv = getLookupConfig(this._semConvVersion);
    this._pid = process.pid || null;
    this._serviceName = config.serviceName;
  }

  get semConv() {
    if (!this._compiledSemConv) {
      this._compiledSemConv = getLookupConfig(this._semConvVersion);
    }
    return this._compiledSemConv;
  }

  get semConvVersion() {
    return this._semConvVersion;
  }

  setHostId(hostId) {
    this._hostId = hostId;
  }

  get hostId() {
    return this._hostId;
  }

  setPid(pid) {
    this._pid = pid ? String(pid) : null;
  }

  get pid() {
    return this._pid;
  }

  /**
   * @param {string} serviceName
   */
  setServiceName(serviceName) {
    this._serviceName = this._serviceName ? this._serviceName : serviceName;
  }

  get serviceName() {
    return this._serviceName;
  }
}

// Exported as a singleton to serve as the unified source of truth
module.exports = new OtlpConfigContext();
