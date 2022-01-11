export = init;
/** @typedef {import('../../core/src/uninstrumentedHttp').UninstrumentedHTTP} UninstrumentedHTTP */
/** @typedef {import('../../core/src/tracing').InstanaInstrumentedModule} InstanaInstrumentedModule */
/** @typedef {import('../../core/src/tracing').TracingMetrics} TracingMetrics */
/** @typedef {import('../../core/src/tracing/spanHandle').SpanHandle} SpanHandle */
/** @typedef {import('../../core/src/tracing/spanHandle').NoopSpanHandle} NoopSpanHandle */
/**
 * @param {import('./util/normalizeConfig').CollectorConfig} [_config]
 */
declare function init(_config?: import('./util/normalizeConfig').CollectorConfig): typeof import(".");
declare namespace init {
    export { currentSpan, isTracing, isConnected, setLogger, instanaNodeJsCore as core, instanaSharedMetrics as sharedMetrics, experimental, opentracing, sdk, UninstrumentedHTTP, InstanaInstrumentedModule, TracingMetrics, SpanHandle, NoopSpanHandle };
}
declare function currentSpan(): import("../../core/src/tracing/spanHandle").SpanHandle | import("../../core/src/tracing/spanHandle").NoopSpanHandle;
declare function isTracing(): boolean;
declare function isConnected(): boolean;
/**
 * @param {import('../../core/src/logger').GenericLogger} logger
 */
declare function setLogger(logger: import('../../core/src/logger').GenericLogger): void;
/** @type {import('../../core/src')} */
declare const instanaNodeJsCore: {
    logger: typeof import("../../core/src/logger");
    metrics: typeof import("@instana/core/src/metrics");
    secrets: typeof import("@instana/core/src/secrets");
    tracing: typeof import("../../core/src/tracing");
    uninstrumentedHttp: import("../../core/src/uninstrumentedHttp").UninstrumentedHTTP;
    util: {
        applicationUnderMonitoring: typeof import("@instana/core/src/util/applicationUnderMonitoring");
        atMostOnce: (name: string, cb: (...args: any) => any) => (...args: any) => any;
        buffer: typeof import("@instana/core/src/util/buffer");
        clone: (x: {
            [x: string]: any;
        } | Object[]) => {
            [x: string]: any;
        };
        compression: (prev: {
            [x: string]: any;
        }, next: {
            [x: string]: any;
        }, excludeList?: any[]) => {
            [x: string]: any;
        };
        excludedFromInstrumentation: Function;
        hasThePackageBeenInitializedTooLate: () => boolean;
        normalizeConfig: (config?: import("@instana/core/src/util/normalizeConfig").InstanaConfig) => import("@instana/core/src/util/normalizeConfig").InstanaConfig;
        propertySizes: (object: {
            [x: string]: any;
        }, prefix?: string) => import("@instana/core/src/util/propertySizes").PropertySize[];
        requireHook: typeof import("@instana/core/src/util/requireHook");
        slidingWindow: typeof import("@instana/core/src/util/slidingWindow");
        stackTrace: typeof import("@instana/core/src/util/stackTrace");
    };
    init: (config: import("@instana/core/src/util/normalizeConfig").InstanaConfig, downstreamConnection: import("../../core/src").DownstreamConnection, processIdentityProvider: typeof import("./pidStore")) => void;
    preInit: () => void;
    registerAdditionalInstrumentations: (additionalInstrumentationModules: import("../../core/src/tracing").InstanaInstrumentedModule[]) => void;
};
/** @type {import('../../shared-metrics/src')} */
declare const instanaSharedMetrics: typeof import("../../shared-metrics/src");
import experimental = require("./experimental");
declare const opentracing: typeof import("../../core/src/tracing/opentracing");
declare const sdk: typeof import("../../core/src/tracing/sdk");
type UninstrumentedHTTP = import('../../core/src/uninstrumentedHttp').UninstrumentedHTTP;
type InstanaInstrumentedModule = import('../../core/src/tracing').InstanaInstrumentedModule;
type TracingMetrics = import('../../core/src/tracing').TracingMetrics;
type SpanHandle = import('../../core/src/tracing/spanHandle').SpanHandle;
type NoopSpanHandle = import('../../core/src/tracing/spanHandle').NoopSpanHandle;
