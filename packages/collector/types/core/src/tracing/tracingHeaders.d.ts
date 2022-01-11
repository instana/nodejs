export function init(config: import('../util/normalizeConfig').InstanaConfig): void;
export function fromHttpRequest(req: import('http').IncomingMessage): TracingHeaders;
export function fromHeaders(headers: import('http').IncomingHttpHeaders): TracingHeaders;
export function setSpanAttributes(span: import('./cls').InstanaBaseSpan, tracingHeaders: TracingHeaders): void;
/**
 * The functions in this module return an object literal with the following shape:
 */
export type TracingHeaders = {
    /**
     * the trace ID:
     * - will be used for span.t
     * - will be used for propagating X-INSTANA-T downstream
     * - will be used for the trace ID part when propagating traceparent downstream
     */
    traceId?: string;
    /**
     * - the full trace ID, when limiting a 128 bit trace ID to 64 bit has occured
     * - when no limiting has been applied, this is unset
     * - will be used for span.lt
     */
    longTraceId?: string;
    /**
     *     - true if and only if trace ID and parent ID have been taken from the traceparent head (instead of being either
     *       taken from X-INSTAN-T/X-INSTANA-S or having been generated).
     */
    usedTraceParent: boolean;
    /**
     * - the parent span ID
     * - will be used for span.p
     * - can be null, when this is a the root entry span of a new trace
     */
    parentId?: string;
    /**
     *     - the tracing level, either '1' (tracing) or '0' (suppressing/not creating spans)
     *     - progated downstream as the first component of X-INSTANA-L
     *     - propagted downstream as the sampled flag in traceparent
     */
    level: string;
    /**
     * - the correlation type parsed from X-INSTANA-L
     * - will be used for span.crtp
     * - will not be propagated downstream
     */
    correlationType?: string;
    /**
     * - the correlation ID parsed from X-INSTANA-L
     * - will be used for span.crid
     * - will not be propagated downstream
     */
    correlationId?: string;
    /**
     *     - true if and only if X-INSTANA-SYNTHETIC=1 was present
     *     - will be used for span.sy
     *     - will not be propagated downstream
     */
    synthetic: boolean;
    /**
     * - only captured when no X-INSTANA-T/S were incoming, but traceparent plus tracestate with an "in" key-value pair
     * were present in the incoming request
     * - will be used as span.ia when present
     */
    instanaAncestor?: InstanaAncestor;
    /**
     *     - the W3C trace context information that was extracted from the incoming request headers traceparent and
     *       tracestate or a newly created W3C trace context if those headers were not present or invalid
     *     - will be used to initialize the internal representation of the incoming traceparent/tracestate
     *     - will be used to manipulate that internal representation according to the W3C trace context spec when creating
     *       new child spans and propagating W3C trace context headers downstream
     *     - see ./w3c_trace_context/W3cTraceContext for documentation of attributes
     */
    w3cTraceContext: import('./w3c_trace_context/W3cTraceContext');
};
export type InstanaAncestor = {
    /**
     * the trace ID from tracestate "in" key-value pair, that is, the trace ID of the closest ancestor
     * span in the trace tree that has been created by an Instana tracer
     */
    t: string;
    /**
     * the parent span ID from tracestate "in" key-value pair, that is, the span ID of the closest
     * ancestor in the trace tree that has been created by an Instana tracer
     */
    p: string;
};
