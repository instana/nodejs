/* eslint-env mocha */

'use strict';

var path = require('path');
var util = require('util');

var AbstractControls = require('../AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'app.js');
  AbstractControls.call(this, opts);
});
util.inherits(Controls, AbstractControls);
