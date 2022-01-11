declare function _exports(config?: CollectorConfig): CollectorConfig;
export = _exports;
export type CollectorConfig = {
    agentPort?: number;
    agentHost?: string;
    tracing?: {
        [x: string]: any;
    };
    autoProfile?: boolean | string;
    reportUncaughtException?: boolean;
    reportUnhandledPromiseRejections?: boolean;
    logger?: import('@instana/core/src/logger').GenericLogger;
    level?: string | number;
};
