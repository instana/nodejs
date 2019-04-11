/* eslint-env mocha */

'use strict';

var path = require('path');

var AbstractControls = require('../../../collector/test/tracing/AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'serverApp.js');
  opts.port = 3217;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
