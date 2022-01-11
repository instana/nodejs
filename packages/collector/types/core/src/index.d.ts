export type PIDData = {
    h?: string;
    e?: string;
    hl?: boolean;
    cp?: string;
};
export type InstanaCore = {
    metrics: typeof metrics;
    secrets: typeof secrets;
    tracing: typeof import("./tracing");
};
export type AgentConnectionEvent = import('../../collector/src/agentConnection').AgentConnectionEvent;
/**
 * This type is based on /nodejs/packages/collector/src/agentConnection.js
 */
export type DownstreamConnection = {
    sendSpans: (spans: any, cb: Function) => void;
    sendEvent: (eventData: AgentConnectionEvent, cb: (...args: any) => any) => void;
};
import log = require("./logger");
import metrics = require("./metrics");
import secrets = require("./secrets");
/** @type {import('./tracing')} */
export const tracing: typeof import("./tracing");
import uninstrumentedHttp = require("./uninstrumentedHttp");
import util = require("./util");
/**
 *
 * @param {import('./util/normalizeConfig').InstanaConfig} config
 * @param {DownstreamConnection} downstreamConnection
 * @param {import('../../collector/src/pidStore')} processIdentityProvider
 */
export function init(config: import('./util/normalizeConfig').InstanaConfig, downstreamConnection: DownstreamConnection, processIdentityProvider: typeof import("../../collector/src/pidStore")): void;
export function preInit(): void;
/**
 * @typedef {{
    h?: string,
    e?: string,
    hl?: boolean,
    cp?: string,
   }} PIDData
 */
/**
 * @typedef {Object} InstanaCore
 * @property {import('./metrics/index')} metrics
 * @property {import('./secrets')} secrets
 * @property {import('./tracing/index')} tracing
 */
/** @typedef {import('../../collector/src/agentConnection').AgentConnectionEvent} AgentConnectionEvent */
/**
 * This type is based on /nodejs/packages/collector/src/agentConnection.js
 * @typedef {Object} DownstreamConnection
 * @property {(spans: *, cb: Function) => void} sendSpans
 * @property {(eventData: AgentConnectionEvent, cb: (...args: *) => *) => void} sendEvent
 */
/**
 * @param {Array.<import('./tracing/index').InstanaInstrumentedModule>} additionalInstrumentationModules
 */
export function registerAdditionalInstrumentations(additionalInstrumentationModules: Array<import('./tracing/index').InstanaInstrumentedModule>): void;
export { log as logger, metrics, secrets, uninstrumentedHttp, util };
