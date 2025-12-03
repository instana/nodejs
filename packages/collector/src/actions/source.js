/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
// eslint-disable-next-line no-unused-vars
exports.init = function init(config) {};

/**
 * @param {import('../agent/requestHandler').AnnounceRequest} request
 * @param {(data: Object.<string, *>) => void} multiCb
 */
exports.getSourceFile = (request, multiCb) => {
  multiCb({ error: 'Functionality disabled.' });
};
