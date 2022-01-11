export function init(_config: InstanaConfig): void;
export function findAndRequire(baseDir: string): any[];
export function registerAdditionalMetrics(additionalMetricsModules: Array<InstanaMetricsModule>): void;
export function activate(): void;
export function deactivate(): void;
export function gatherData(): {
    [x: string]: string;
};
export function setLogger(logger: import('../logger').GenericLogger): void;
export type InstanaConfig = import('../util/normalizeConfig').InstanaConfig;
export type InstanaMetricsModule = {
    payloadPrefix: string;
    currentPayload?: string;
    activate?: (config?: InstanaConfig) => void;
    deactivate?: () => void;
    setLogger?: (logger: import('../logger').GenericLogger) => void;
};
