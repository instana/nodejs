declare function _exports(isCallbackApi: boolean): {
    startEntrySpan: (name: string, tags?: {
        [x: string]: any;
    } | Function, traceId?: {
        [x: string]: any;
    } | Function | string, parentSpanId?: string, callback?: Function | {
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
export = _exports;
