'use strict';

const DataProcessor = require('../DataProcessor');

const CoreDataSource = require('./CoreDataSource');

class NodeJsProcessor extends DataProcessor {
  constructor(coreAndShared, pid) {
    super('com.instana.plugin.nodejs');
    this.pid = pid;
    this.addSource('core', new CoreDataSource(coreAndShared));
  }

  getEntityId() {
    return this.pid;
  }

  processData(rawDataPerSource) {
    return { ...rawDataPerSource.core, pid: this.pid };
  }
}

module.exports = exports = NodeJsProcessor;
