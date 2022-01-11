export function registerAdditionalInstrumentations(_additionalInstrumentationModules: Array<InstanaInstrumentedModule>): void;
export function preInit(preliminaryConfig: import('../util/normalizeConfig').InstanaConfig): void;
export function init(_config: import('../util/normalizeConfig').InstanaConfig, downstreamConnection: import('..').DownstreamConnection, _processIdentityProvider: CollectorPIDStore): void;
export function activate(): void;
export function deactivate(): void;
export function getHandleForCurrentSpan(): spanHandle.SpanHandle | spanHandle.NoopSpanHandle;
export function getCls(): typeof import("./cls");
export function setExtraHttpHeadersToCapture(_extraHeaders: Array<string>): void;
export function enableSpanBatching(): void;
export function _getAndResetTracingMetrics(): TracingMetrics;
export function _instrument(name: string, module_: any): void;
export function _debugCurrentSpanName(): string;
export type CollectorPIDStore = typeof import("../../../collector/src/pidStore");
export type TracingMetrics = {
    pid: number;
    metrics: {
        opened: number;
        closed: number;
        dropped: number;
    };
};
/**
 * This is a temporary type definition for instrumented modules until we get to add types to these modules.
 * For now it is safe to say that these modules are objects with the following methods:
 */
export type InstanaInstrumentedModule = {
    init: Function;
    activate: Function;
    deactivate: Function;
    updateConfig?: Function;
    setExtraHttpHeadersToCapture?: (extraHeaders: Array<any>) => {};
    batchable?: boolean;
    spanName?: string;
};
import constants = require("./constants");
import tracingHeaders = require("./tracingHeaders");
import opentracing = require("./opentracing");
import sdk = require("./sdk");
import spanBuffer = require("./spanBuffer");
import supportedVersion = require("./supportedVersion");
import tracingUtil = require("./tracingUtil");
import spanHandle = require("./spanHandle");
export { constants, tracingHeaders, opentracing, sdk, spanBuffer, supportedVersion, tracingUtil as util };
