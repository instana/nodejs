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
    logger?: any;
    level?: string | number;
};
