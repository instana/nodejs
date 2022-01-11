/**
 * This type is to be used across the code base, as we don't have a public explicit type for a span.
 * Also, it is often that we simply create a literal object and gradually throw few properties on it and
 * handle them as spans. This type has all span properties, but they are all optional, so we can safely
 * type these literal objects.
 * TODO: move InstanaSpan and InstanaPseudoSpan to their own file and make them publicly accessible?
 */
export type InstanaBaseSpan = {
    /**
     * trace ID
     */
    t?: string;
    /**
     * parent span ID
     */
    p?: string;
    /**
     * span ID
     */
    s?: string;
    /**
     * type/name
     */
    n?: string;
    /**
     * kind
     */
    k?: number;
    /**
     * error count
     */
    ec?: number;
    /**
     * timestamp
     */
    ts?: number;
    /**
     * duration
     */
    d?: number;
    /**
     * from section
     */
    f?: {
        e?: string;
        h?: string;
        hl?: boolean;
        cp?: string;
    };
    /**
     * trace ID is from traceparent header
     */
    tp?: boolean;
    /**
     * long trace ID
     */
    lt?: string;
    /**
     * closest Instana ancestor span
     */
    ia?: object;
    /**
     * correlation type
     */
    crtp?: string;
    /**
     * correlation ID
     */
    crid?: string;
    /**
     * synthetic marker
     */
    sy?: boolean;
    /**
     * stack trace
     */
    stack?: any;
    data?: {
        [x: string]: any;
    };
    /**
     * batching information
     */
    b?: {
        s?: number;
        d?: number;
    };
    /**
     * GraphQL destination
     */
    gqd?: any;
    transmit?: Function;
    freezePathTemplate?: Function;
    disableAutoEnd?: Function;
    transmitManual?: Function;
};
export const currentEntrySpanKey: "com.instana.entry";
export const currentSpanKey: "com.instana.span";
export const reducedSpanKey: "com.instana.reduced";
export const tracingLevelKey: "com.instana.tl";
export const w3cTraceContextKey: "com.instana.w3ctc";
export const ns: import("./clsHooked/context-legacy").Namespace | import("./clsHooked/context").Namespace;
/**
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 * @param {import('../../../collector/src/pidStore')} _processIdentityProvider
 */
export function init(config: import('../util/normalizeConfig').InstanaConfig, _processIdentityProvider: typeof import("../../../collector/src/pidStore")): void;
/**
 * Start a new span and set it as the current span.
 * @param {string} spanName
 * @param {number} kind
 * @param {string} traceId
 * @param {string} parentSpanId
 * @param {import('./w3c_trace_context/W3cTraceContext')} [w3cTraceContext]
 * @returns {InstanaSpan}
 */
export function startSpan(spanName: string, kind: number, traceId: string, parentSpanId: string, w3cTraceContext?: import('./w3c_trace_context/W3cTraceContext')): InstanaSpan;
/**
 * Puts a pseudo span in the CLS context that is simply a holder for a trace ID and span ID. This pseudo span will act
 * as the parent for other child span that are produced but will not be transmitted to the agent itself.
 * @param {string} spanName
 * @param {number} kind
 * @param {string} traceId
 * @param {string} spanId
 */
export function putPseudoSpan(spanName: string, kind: number, traceId: string, spanId: string): InstanaPseudoSpan;
export function getCurrentEntrySpan(): any;
/**
 * Set the currently active span.
 * @param {InstanaSpan} span
 */
export function setCurrentSpan(span: InstanaSpan): void;
/**
 * Get the currently active span.
 * @returns {InstanaSpan}
 */
export function getCurrentSpan(): InstanaSpan;
export function getReducedSpan(): any;
/**
 * Stores the W3C trace context object.
 * @param {import('./w3c_trace_context/W3cTraceContext')} traceContext
 */
export function setW3cTraceContext(traceContext: import('./w3c_trace_context/W3cTraceContext')): void;
export function getW3cTraceContext(): any;
export function isTracing(): boolean;
/**
 * Set the tracing level
 * @param {string} level
 */
export function setTracingLevel(level: string): void;
export function tracingLevel(): any;
export function tracingSuppressed(): boolean;
export function getAsyncContext(): {
    [x: string]: any;
};
/**
 * Do not use enterAsyncContext unless you absolutely have to. Instead, use one of the methods provided in the sdk,
 * that is, runInAsyncContext or runPromiseInAsyncContext.
 *
 * If you use enterAsyncContext anyway, you are responsible for also calling leaveAsyncContext later on. Leaving the
 * async context is managed automatically for you with the runXxxInAsyncContext functions.
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 */
export function enterAsyncContext(context: import('./clsHooked/context').InstanaCLSContext): void;
/**
 * Needs to be called if and only if enterAsyncContext has been used earlier.
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 */
export function leaveAsyncContext(context: import('./clsHooked/context').InstanaCLSContext): void;
/**
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 */
export function runInAsyncContext(context: import('./clsHooked/context').InstanaCLSContext, fn: Function): any;
/**
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 * @returns {Function | *}
 */
export function runPromiseInAsyncContext(context: import('./clsHooked/context').InstanaCLSContext, fn: Function): Function | any;
/**
 * This type is to be used across the code base, as we don't have a public explicit type for a span.
 * Also, it is often that we simply create a literal object and gradually throw few properties on it and
 * handle them as spans. This type has all span properties, but they are all optional, so we can safely
 * type these literal objects.
 * TODO: move InstanaSpan and InstanaPseudoSpan to their own file and make them publicly accessible?
 * @typedef {Object} InstanaBaseSpan
 * @property {string} [t] trace ID
 * @property {string} [p] parent span ID
 * @property {string} [s] span ID
 * @property {string} [n] type/name
 * @property {number} [k] kind
 * @property {number} [ec] error count
 * @property {number} [ts] timestamp
 * @property {number} [d] duration
 * @property {{e?: string, h?: string, hl?: boolean, cp?: string}} [f] from section
 * @property {boolean} [tp] trace ID is from traceparent header
 * @property {string} [lt] long trace ID
 * @property {object} [ia] closest Instana ancestor span
 * @property {string} [crtp] correlation type
 * @property {string} [crid] correlation ID
 * @property {boolean} [sy] synthetic marker
 * @property {*} [stack] stack trace
 * @property {Object.<string, *>} [data]
 * @property {{s?: number, d?: number}} [b] batching information
 * @property {*} [gqd] GraphQL destination
 * @property {Function} [transmit]
 * @property {Function} [freezePathTemplate]
 * @property {Function} [disableAutoEnd]
 * @property {Function} [transmitManual]
 */
declare class InstanaSpan {
    /**
     * @param {string} name
     */
    constructor(name: string);
    t: any;
    s: any;
    p: any;
    n: string;
    k: any;
    f: {
        e: string;
        h: string;
    };
    ec: number;
    ts: number;
    d: number;
    /** @type {Array.<*>} */
    stack: Array<any>;
    /** @type {Object.<string, *>} */
    data: {
        [x: string]: any;
    };
    /**
     * @param {Function} fn
     */
    addCleanup(fn: Function): void;
    transmit(): void;
    transmitted: boolean;
    transmitManual(): void;
    cancel(): void;
    cleanup(): void;
    freezePathTemplate(): void;
    pathTplFrozen: boolean;
    disableAutoEnd(): void;
    manualEndMode: boolean;
}
/**
 * Overrides transmit and cancel so that a pseudo span is not put into the span buffer. All other behaviour is inherited
 * from InstanaSpan.
 */
declare class InstanaPseudoSpan extends InstanaSpan {
}
export {};
