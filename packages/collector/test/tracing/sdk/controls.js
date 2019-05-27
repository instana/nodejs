/* eslint-env mocha */

'use strict';

const path = require('path');
const util = require('util');

const AbstractControls = require('../AbstractControls');

const Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'app.js');
  AbstractControls.call(this, opts);
});
util.inherits(Controls, AbstractControls);
