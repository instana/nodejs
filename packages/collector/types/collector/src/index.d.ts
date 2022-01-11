export = init;
/**
 * @param {import('./util/normalizeConfig').CollectorConfig} [_config]
 */
declare function init(_config?: import('./util/normalizeConfig').CollectorConfig): typeof init;
declare namespace init {
    export function currentSpan(): import("@instana/core/src/tracing/spanHandle").SpanHandle | import("@instana/core/src/tracing/spanHandle").NoopSpanHandle;
    export function isTracing(): boolean;
    export function isConnected(): boolean;
    /**
     * @param {import('@instana/core/src/logger').GenericLogger} logger
     */
    export function setLogger(logger: import("@instana/core/src/logger").GenericLogger): void;
    export { instanaNodeJsCore as core };
    export { instanaSharedMetrics as sharedMetrics };
    export { experimental };
    export const opentracing: typeof import("@instana/core/src/tracing/opentracing");
    export const sdk: typeof import("@instana/core/src/tracing/sdk");
}
/** @type {import('../../core/src')} */
declare const instanaNodeJsCore: {
    logger: typeof import("@instana/core/src/logger");
    metrics: typeof import("@instana/core/src/metrics");
    secrets: typeof import("@instana/core/src/secrets");
    tracing: typeof import("@instana/core/src/tracing");
    uninstrumentedHttp: import("@instana/core/src/uninstrumentedHttp").UninstrumentedHTTP;
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
    registerAdditionalInstrumentations: (additionalInstrumentationModules: import("@instana/core/src/tracing").InstanaInstrumentedModule[]) => void;
};
/** @type {import('../../shared-metrics/src')} */
declare const instanaSharedMetrics: typeof import("../../shared-metrics/src");
import experimental = require("./experimental");
