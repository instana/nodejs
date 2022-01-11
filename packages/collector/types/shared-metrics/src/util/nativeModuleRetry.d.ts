export = loadNativeAddOn;
/**
 * @param {InstanaSharedMetricsOptions} opts
 * @returns {ModuleLoadEmitter}
 */
declare function loadNativeAddOn(opts: InstanaSharedMetricsOptions): ModuleLoadEmitter;
declare namespace loadNativeAddOn {
    export { setLogger, selfNodeModulesPath, InstanaSharedMetricsOptions };
}
type InstanaSharedMetricsOptions = {
    nativeModuleName?: string;
    nativeModulePath?: string;
    nativeModuleParentPath?: string;
    moduleRoot?: string;
    message?: string;
    loadFrom?: string;
};
declare class ModuleLoadEmitter extends EventEmitter {
}
/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
declare function setLogger(_logger: import('@instana/core/src/logger').GenericLogger): void;
declare var selfNodeModulesPath: string;
import EventEmitter = require("events");
