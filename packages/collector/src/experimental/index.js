'use strict';

var instanaNodeJsCore = require('@instana/core');

exports.instrument = instanaNodeJsCore.tracing._instrument;
