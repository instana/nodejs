export = W3cTraceContext;
declare function W3cTraceContext(): void;
declare class W3cTraceContext {
    traceParentValid: boolean;
    version: string;
    traceParentTraceId: string;
    traceParentParentId: string;
    sampled: boolean;
    traceStateValid: boolean;
    traceStateHead: any;
    instanaTraceId: string;
    instanaParentId: string;
    traceStateTail: any;
    /**
     * @returns {string}
     */
    renderTraceParent(): string;
    /**
     * @returns {'01' | '00'}
     */
    renderFlags(): '01' | '00';
    /**
     * @returns {boolean}
     */
    hasTraceState(): boolean;
    /**
     * @returns {string}
     */
    renderTraceState(): string;
    renderInstanaTraceStateValue(): string;
    resetTraceState(): void;
    /**
     * Modifies this trace context object:
     * - updates the foreing parent ID in traceparent to the given given value (not that we do not set the
     *   foreign trace ID),
     * - sets the sampled flag in traceparent to true,
     * - upserts the in key-value pair in tracestate to the given trace ID and span ID, and moved to the leftmost position.
     * @param {string} instanaTraceId
     * @param {string} instanaParentId
     */
    updateParent(instanaTraceId: string, instanaParentId: string): void;
    /**
     * @param {string} longTraceId
     */
    restartTrace(longTraceId: string): void;
    disableSampling(): void;
    clone(): W3cTraceContext;
    getMostRecentForeignTraceStateMember(): any;
}
declare namespace W3cTraceContext {
    /**
     * @param {string} instanaTraceId
     * @param {string} instanaParentId
     * @param {boolean | *} sampled
     * @returns {W3cTraceContext}
     */
    export function fromInstanaIds(instanaTraceId: string, instanaParentId: string, sampled: any): W3cTraceContext;
    /**
     * @param {string} traceId
     * @param {string} parentId
     * @returns
     */
    export function createEmptyUnsampled(traceId: string, parentId: string): W3cTraceContext;
    export { VERSION00 };
    export { SAMPLED_BITMASK };
}
declare const VERSION00: "00";
declare const SAMPLED_BITMASK: 1;
