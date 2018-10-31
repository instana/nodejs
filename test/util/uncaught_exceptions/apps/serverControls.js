/* eslint-env mocha */

'use strict';

var path = require('path');

var AbstractControls = require('../../../tracing/AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'server.js');
  this.dontKillInAfterHook = true;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
