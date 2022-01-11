export function init(config: import('./util/normalizeConfig').CollectorConfig, isReInit?: boolean): void;
export function getLogger(loggerName: string, reInitFn?: (logger: import('@instana/core/src/logger').GenericLogger) => any): import('@instana/core/src/logger').GenericLogger;
