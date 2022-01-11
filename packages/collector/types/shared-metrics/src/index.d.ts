export type InstanaSharedMetrics = {
    allMetrics: Array<import('@instana/core/src/metrics').InstanaMetricsModule>;
    util: {
        nativeModuleRetry: typeof import("./util/nativeModuleRetry");
        setLogger: (logger: import("@instana/core/src/logger").GenericLogger) => void;
    };
    setLogger: (logger: import('@instana/core/src/logger').GenericLogger) => void;
};
/** @type {Array.<import('@instana/core/src/metrics').InstanaMetricsModule>} */
export const allMetrics: Array<import('@instana/core/src/metrics').InstanaMetricsModule>;
import util = require("./util");
/**
 * @param {import('@instana/core/src/logger').GenericLogger} logger
 */
export function setLogger(logger: import('@instana/core/src/logger').GenericLogger): void;
export { util };
