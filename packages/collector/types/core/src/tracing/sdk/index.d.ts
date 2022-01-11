export function init(_cls: typeof import("../cls")): void;
export function activate(): void;
export function deactivate(): void;
export function getAsyncContext(): {
    [x: string]: any;
};
export function runInAsyncContext(context: import('../clsHooked/context').InstanaCLSContext, fn: Function): any;
export function runPromiseInAsyncContext(context: import('../clsHooked/context').InstanaCLSContext, fn: Function): any;
export const callback: {
    startEntrySpan: (name: string, tags?: Function | {
        [x: string]: any;
    }, traceId?: string | Function | {
        [x: string]: any;
    }, parentSpanId?: string, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeEntrySpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    startIntermediateSpan: (name: string, tags?: {
        [x: string]: any;
    }, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeIntermediateSpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    startExitSpan: (name: string, tags?: {
        [x: string]: any;
    }, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeExitSpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    bindEmitter: (emitter: any) => void;
    init: (_cls: typeof import("../cls")) => void;
    activate: () => void;
    deactivate: () => void;
};
export const promise: {
    startEntrySpan: (name: string, tags?: Function | {
        [x: string]: any;
    }, traceId?: string | Function | {
        [x: string]: any;
    }, parentSpanId?: string, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeEntrySpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    startIntermediateSpan: (name: string, tags?: {
        [x: string]: any;
    }, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeIntermediateSpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    startExitSpan: (name: string, tags?: {
        [x: string]: any;
    }, callback?: Function | {
        [x: string]: any;
    }, ...args: any[]) => Function | Promise<any>;
    completeExitSpan: (error: Error, tags: {
        [x: string]: any;
    }) => void;
    bindEmitter: (emitter: any) => void;
    init: (_cls: typeof import("../cls")) => void;
    activate: () => void;
    deactivate: () => void;
};
export { promise as async };
