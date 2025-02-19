/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const EventEmitter = require('events');
const core = require('@instana/core');

const SKIPPED = {};

let processorIdx = 0;

/**
 * A base class for data processors which transform raw snapshot data and metrics into the format a back end plug-in
 * expects.A processor fetches data from the connected data source, processes it and assigns it to a specific
 * plug-in ID and entity ID.
 */
class DataProcessor extends EventEmitter {
  constructor(pluginName, compressionExcludeList) {
    super();
    // all data sources
    this.dataSources = {};
    // data sources that need to have refreshed before the processor is ready
    this.essentialDataSources = {};
    this.compressionExcludeList = compressionExcludeList;
    this.pluginName = pluginName;
    this.id = `${this.pluginName}--${processorIdx++}`;
    this.previous = {};
    this.next = {};
    this._resetCompressionState();

    // We send snapshot data and metrics every second, so with sendUncompressedEveryXTransmissions = 300 we get an
    // uncompressed transmission about every 5 minutes.
    this.sendUncompressedEveryXTransmissions = 300;
  }

  getId() {
    return this.id;
  }

  addSource(id, source, essential = true) {
    this.dataSources[id] = source;
    if (essential) {
      this.essentialDataSources[id] = source;
      source.on('firstRefresh', () => {
        this._potentiallyEmitReadyEvent();
      });
    }
  }

  activate() {
    this._forEachSource(source => source.activate());
  }

  deactivate() {
    this._forEachSource(source => source.deactivate());
  }

  resetSources() {
    this._forEachSource(source => source.reset());
    this._resetCompressionState();
  }

  _resetCompressionState() {
    this.lastCompressionFetchPerSource = {};
    this.compressedTransmissionsSinceLastUncompressed = 0;
    this.lastTransmittedPayload = null;
  }

  isReady() {
    const essentialDataSourceIds = Object.keys(this.essentialDataSources);
    if (essentialDataSourceIds.length === 0) {
      // no data sources connected
      return false;
    }

    if (essentialDataSourceIds.find(id => !this.dataSources[id].hasRefreshedAtLeastOnce()) != null) {
      // We found at least one essential data source which has not successfully refreshed at least once. This processor
      // is not ready yet.
      return false;
    }
    return true;
  }

  _potentiallyEmitReadyEvent() {
    if (this.isReady()) {
      this.emit('ready', this._getFullPayload());
    }
  }

  getEntityId() {
    throw new Error('DataProcessor needs to override getEntityId.');
  }

  _getFullPayload() {
    return this.wrapAsPayload(this.getUncompressedData());
  }

  canSkipRecompilation() {
    // See getUncompressedData for details on skipping recompilation.

    // Subclassed can override this to disable recompilation skipping completely (important for sources for derived
    // entities). The default behaviour is: Skipping recompilation is allowed if there is no or an empty
    // compressionExcludeList. This is what most processors should do.
    return !this.compressionExcludeList || this.compressionExcludeList.length === 0;
  }

  getUncompressedData(withSkip) {
    if (!this.isReady()) {
      return null;
    }

    const willSendUncompressedUpdate = this._shouldSendUncompressedUpdate();

    // Optimization for compression: If none of the sources have refreshed since they were last asked for raw data, we
    // can return an empty data object without recompiling and without going through the per-attribute-diff compression
    // algorithm at all.
    const skipRecompile =
      // make sure it is not a getUncompressedData call triggered implicitly (by getEntityId from subclass, for example)
      withSkip &&
      // check if this data processor opted out of recompilation skipping
      this.canSkipRecompilation() &&
      // do not skip recompilation if next compress call would decide to send a full update
      !willSendUncompressedUpdate &&
      // only skip if no source has refreshed since the last getUncompressedData call
      Object.keys(this.dataSources).find(
        id =>
          // we haven't fetched data from this source with compression, ever
          this.lastCompressionFetchPerSource[id] == null ||
          // this source has refreshed since we last got data from it
          this.dataSources[id].getLastRefreshTimestamp() > this.lastCompressionFetchPerSource[id]
      ) == null;

    if (skipRecompile) {
      return SKIPPED;
    } else {
      return this._getProcessedData(withSkip);
    }
  }

  _shouldSendUncompressedUpdate() {
    return (
      this.lastTransmittedPayload == null ||
      this.compressedTransmissionsSinceLastUncompressed >= this.sendUncompressedEveryXTransmissions
    );
  }

  compress(uncompressedData) {
    let dataToBeSent;
    const shouldSendUncompressedUpdate = uncompressedData === SKIPPED || this._shouldSendUncompressedUpdate();
    if (shouldSendUncompressedUpdate) {
      dataToBeSent = uncompressedData;
    } else {
      dataToBeSent = core.util.compression(this.lastTransmittedPayload, uncompressedData, this.compressionExcludeList);
    }

    if (this.compressedTransmissionsSinceLastUncompressed >= this.sendUncompressedEveryXTransmissions) {
      this.compressedTransmissionsSinceLastUncompressed = 0;
    }

    return dataToBeSent;
  }

  wrapAsPayload(data) {
    return {
      name: this.pluginName,
      entityId: this.getEntityId(),
      data
    };
  }

  _getProcessedData(withSkip) {
    this.next = {};
    const processed = this.processData(this._compileRawData(withSkip), this.previous, this.next);
    this.previous = this.next;
    return processed;
  }

  processData() {
    throw new Error('DataProcessor needs to override processData.');
  }

  _compileRawData(withSkip) {
    const rawDataPerSource = {};
    this._forEachSource((source, id) => {
      rawDataPerSource[id] = source.getRawData();
      if (withSkip) {
        this.lastCompressionFetchPerSource[id] = Date.now();
      }
    });
    return rawDataPerSource;
  }

  setLastTransmittedPayload(payload) {
    if (payload !== SKIPPED) {
      this.lastTransmittedPayload = payload;
    }
    this.compressedTransmissionsSinceLastUncompressed++;
  }

  _forEachSource(fn) {
    Object.keys(this.dataSources).forEach(id => fn(this.dataSources[id], id));
  }
}

module.exports = exports = DataProcessor;
