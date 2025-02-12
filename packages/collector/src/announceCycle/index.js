/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * @typedef {Object} AnnounceCycleContext
 * @property {(newStateName: string) => void} transitionTo
 */

/**
 * @typedef {Object} AgentState
 * @property {(ctx: AnnounceCycleContext) => void} enter
 * @property {(ctx?: AnnounceCycleContext) => void} leave
 */

const agentHostLookup = require('./agentHostLookup');
const unannounced = require('./unannounced');
const announced = require('./announced');
const agentready = require('./agentready');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/** @type {string} */
let currentState = null;

/** @type {Object.<string, AgentState>} */
const states = {
  agentHostLookup,
  unannounced,
  announced,
  agentready
};

/** @type {AnnounceCycleContext} */
const ctx = {
  /**
   * @param {string} newStateName
   */
  transitionTo: function (newStateName) {
    logger.info(`Transitioning from ${currentState || '<init>'} to ${newStateName}`);

    if (currentState) {
      states[currentState].leave(ctx);
    }
    currentState = newStateName;
    states[newStateName].enter(ctx);
  }
};

/**
 * @param {import('@instana/core/src/util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  agentHostLookup.init(config);
  unannounced.init(config);
  announced.init(config);
  agentready.init(config);
};

exports.start = function start() {
  ctx.transitionTo('agentHostLookup');
};
