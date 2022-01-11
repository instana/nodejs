export = Tracer;
/**
 * @param {boolean} isActive
 */
declare function Tracer(isActive: boolean, ...args: any[]): void;
declare class Tracer {
    /**
     * @param {boolean} isActive
     */
    constructor(isActive: boolean, ...args: any[]);
    _isActive: boolean;
    /**
     * @param {string} name
     * @param {import('./Span').SpanFields} fields
     * @returns {Span}
     */
    _startSpan(name: string, fields: import('./Span').SpanFields): Span;
    /**
     *
     * @param {opentracing.SpanContext} spanContext
     * @param {string} format
     * @param {Object.<string, *>} carrier
     * @returns
     */
    _inject(spanContext: opentracing.SpanContext, format: string, carrier: {
        [x: string]: any;
    }): void;
    /**
     * @param {string} format
     * @param {*} carrier
     * @returns {opentracing.SpanContext}
     */
    _extract(format: string, carrier: any): opentracing.SpanContext;
    activate(): void;
    deactivate(): void;
}
import Span = require("./Span");
import opentracing = require("opentracing");
