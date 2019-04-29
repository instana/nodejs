/* eslint-env mocha */

'use strict';

var path = require('path');

var AbstractControls = require('../../tracing/AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'server.js');
  this.dontKillInAfterHook = opts.dontKillInAfterHook !== false;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
