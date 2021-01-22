/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const instanaNodeJsCore = require('@instana/core');

exports.instrument = instanaNodeJsCore.tracing._instrument;
