export function getHandleForCurrentSpan(cls: typeof import("./cls")): SpanHandle | NoopSpanHandle;
/**
 * Provides very limited access from client code to the current active span.
 * @param {import('./cls').InstanaBaseSpan} _span
 */
export function SpanHandle(_span: import('./cls').InstanaBaseSpan): void;
export class SpanHandle {
    /**
     * Provides very limited access from client code to the current active span.
     * @param {import('./cls').InstanaBaseSpan} _span
     */
    constructor(_span: import('./cls').InstanaBaseSpan);
    span: import("./cls").InstanaBaseSpan;
    /**
     * Returns the trace ID of the span.
     */
    getTraceId(): string;
    /**
     * Returns the span ID of the span.
     */
    getSpanId(): string;
    /**
     * Returns the parent span ID of the span.
     */
    getParentSpanId(): string;
    /**
     * Returns the name of the span.
     */
    getName(): string;
    isEntrySpan(): boolean;
    isExitSpan(): boolean;
    isIntermediateSpan(): boolean;
    /**
     * Returns the timestamp of the span's start.
     */
    getTimestamp(): number;
    /**
     * Returns the duration of the span. This method will return 0 if the span has not been completed yet.
     */
    getDuration(): number;
    /**
     * Returns the error count of the span. This method will usually return 0 if the span has not been completed yet.
     */
    getErrorCount(): number;
    /**
     * @param {string} path
     * @param {*} value
     */
    annotate(path: string, value: any): void;
    /**
     * Switches the span into manual-end-mode. Calls to span#transmit() as used by automatic tracing instrumentation will be
     * ignored. Instead, client code needs to finish the span (and trigger transmission) by calling spanHandle#end();
     */
    disableAutoEnd(): void;
    /**
     * Finishes as span that has been switched to manual-end-mode before.
     * @param {boolean | number} errorCount
     */
    end(errorCount: boolean | number): void;
}
/**
 * TODO: make it as a class
 * Provides noop operation for the SpanHandle API when automatic tracing is not enabled or no span is currently active.
 */
export function NoopSpanHandle(): void;
export class NoopSpanHandle {
    /**
     * @returns {null}
     */
    getTraceId(): null;
    /**
     * @returns {null}
     */
    getSpanId(): null;
    /**
     * @returns {null}
     */
    getParentSpanId(): null;
    /**
     * @returns {null}
     */
    getName(): null;
    isEntrySpan(): boolean;
    isExitSpan(): boolean;
    isIntermediateSpan(): boolean;
    getTimestamp(): number;
    getDuration(): number;
    getErrorCount(): number;
    annotate(): void;
    disableAutoEnd(): void;
    end(): void;
}
