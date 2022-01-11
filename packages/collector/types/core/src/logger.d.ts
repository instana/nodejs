export function init(config?: LoggerConfig): void;
export function getLogger(loggerName: string, reInitFn?: (arg: any) => any): GenericLogger;
export type GenericLogger = {
    debug: (...args: any) => void;
    info: (...args: any) => void;
    warn: (...args: any) => void;
    error: (...args: any) => void;
    child?: any;
};
export type LoggerConfig = {
    logger?: any;
};
