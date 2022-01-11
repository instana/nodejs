export const applicationUnderMonitoring: typeof import("./applicationUnderMonitoring");
export const atMostOnce: (name: string, cb: (...args: any) => any) => (...args: any) => any;
export const buffer: typeof import("./buffer");
export const clone: (x: {
    [x: string]: any;
} | Object[]) => {
    [x: string]: any;
};
export const compression: (prev: {
    [x: string]: any;
}, next: {
    [x: string]: any;
}, excludeList?: any[]) => {
    [x: string]: any;
};
export const excludedFromInstrumentation: Function;
export const hasThePackageBeenInitializedTooLate: () => boolean;
export function normalizeConfig(config?: import("./normalizeConfig").InstanaConfig): import("./normalizeConfig").InstanaConfig;
export function propertySizes(object: {
    [x: string]: any;
}, prefix?: string): import("./propertySizes").PropertySize[];
export const requireHook: typeof import("./requireHook");
export const slidingWindow: typeof import("./slidingWindow");
export const stackTrace: typeof import("./stackTrace");
