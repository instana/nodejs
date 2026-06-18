/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getLookupConfig } = require('./semconv');

const DEFAULT_SEMCONV_VERSION = '1.23';

class OtlpConfigContext {
  constructor() {
    this._config = null;
    this._semConvVersion = DEFAULT_SEMCONV_VERSION;
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
    this._semConvVersion = config.semConvVersion || DEFAULT_SEMCONV_VERSION;
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

  setHostId(hostId) {
    if (this._hostId === hostId) {
      return;
    }
    this._hostId = hostId;
  }

  get hostId() {
    return this._hostId;
  }

  setPid(pid) {
    const normalizedPid = pid ? String(pid) : null;

    if (this._pid === normalizedPid) {
      return;
    }
    this._pid = normalizedPid;
  }

  get pid() {
    return this._pid;
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

// Exported as a singleton to serve as the unified source of truth
module.exports = new OtlpConfigContext();
