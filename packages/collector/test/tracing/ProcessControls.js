'use strict';

const path = require('path');

const AbstractControls = require('./AbstractControls');

function ProcessControls(opts) {
  if (!opts.appPath && !opts.dirname) {
    throw new Error('Missing mandatory config option, either appPath or dirname needs to be provided.');
  }
  if (opts.appPath && opts.dirname) {
    throw new Error('Invalid config, appPath and dirname are mutually exclusive.');
  }
  if (!opts.appPath && opts.dirname) {
    opts.appPath = path.join(opts.dirname, 'app');
  }

  opts.port = opts.port || 3216;
  AbstractControls.call(this, opts);
}

ProcessControls.prototype = Object.create(AbstractControls.prototype);

module.exports = ProcessControls;
