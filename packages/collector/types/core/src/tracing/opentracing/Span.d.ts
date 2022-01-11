export = Span;
/**
 *
 * @param {import('./Tracer')} tracer
 * @param {string} name
 * @param {SpanFields} fields
 */
declare function Span(tracer: import('./Tracer'), name: string, fields: SpanFields): void;
declare class Span {
    /**
     *
     * @param {import('./Tracer')} tracer
     * @param {string} name
     * @param {SpanFields} fields
     */
    constructor(tracer: import('./Tracer'), name: string, fields: SpanFields);
    tracerImpl: import("./Tracer");
    _contextImpl: opentracing.SpanContext;
    /** @type {OpenTracingSpan} */
    span: OpenTracingSpan;
    _context(): opentracing.SpanContext;
    _tracer(): import("./Tracer");
    /**
     * @param {string} name
     */
    _setOperationName(name: string): void;
    /**
     * @param {string} key
     * @param {*} value
     */
    _setBaggageItem(key: string, value: any): void;
    /**
     * @param {string} key
     */
    _getBaggageItem(key: string): any;
    /**
     * @param {Object.<string, *>} keyValuePairs
     */
    _addTags(keyValuePairs: {
        [x: string]: any;
    }): void;
    /**
     * @param {string} key
     * @param {*} value
     */
    _addTag(key: string, value: any): void;
    /**
     * @param {Object.<string, *>} keyValuePairs
     * @param {number} timestamp
     */
    _log(keyValuePairs: {
        [x: string]: any;
    }, timestamp: number): void;
    /**
     * @param {number} finishTime
     */
    _finish(finishTime: number): void;
}
declare namespace Span {
    export { init, setProcessIdentityProvider, CollectorPIDStore, OpenTracingSpanDataSdkCustom, OpenTracingSpanDataSdk, OpenTracingSpanData, OpenTracingSpan, SpanFieldReference, SpanFields };
}
type SpanFields = {
    references: Array<SpanFieldReference>;
    startTime: number;
    operationName: string;
    tags: any;
};
import opentracing = require("opentracing");
type OpenTracingSpan = {
    s: string;
    t: string;
    p: string;
    ec: number;
    ts: number;
    d: number;
    n: string;
    stack: any;
    data: OpenTracingSpanData;
    f?: any;
};
/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 * @param {CollectorPIDStore} _processIdentityProvider
 */
declare function init(config: import('../../util/normalizeConfig').InstanaConfig, _processIdentityProvider: CollectorPIDStore): void;
/**
 * @param {CollectorPIDStore} fn
 */
declare function setProcessIdentityProvider(fn: CollectorPIDStore): void;
type CollectorPIDStore = typeof import("../../../../collector/src/pidStore");
type OpenTracingSpanDataSdkCustom = {
    tags: any;
    logs: any;
};
type OpenTracingSpanDataSdk = {
    type: 'local' | 'entry' | 'exit';
    name: string;
    custom: OpenTracingSpanDataSdkCustom;
};
type OpenTracingSpanData = {
    service: string;
    sdk: OpenTracingSpanDataSdk;
};
type SpanFieldReference = {
    type: () => string;
    referencedContext: () => any;
};
