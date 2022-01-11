export = init;
/**
 * @param {import('./util/normalizeConfig').CollectorConfig} [_config]
 */
declare function init(_config?: import('./util/normalizeConfig').CollectorConfig): typeof init;
declare namespace init {
    export function currentSpan(): any;
    export function isTracing(): any;
    export function isConnected(): boolean;
    /**
     * @param {import('@instana/core/src/logger').GenericLogger} logger
     */
    export function setLogger(logger: any): void;
    export { instanaNodeJsCore as core };
    export { instanaSharedMetrics as sharedMetrics };
    export { experimental };
    export const opentracing: any;
    export const sdk: any;
}
import experimental = require("./experimental");
