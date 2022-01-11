export function findAllMatchingItems(items: Array<import('../../src/tracing/cls').InstanaBaseSpan>, expectations: ((span: InstanaBaseSpan) => void)[] | ((span: InstanaBaseSpan) => void)): MatchResult;
export function reportFailure(result: MatchResult, lookingFor: any): never;
export type InstanaBaseSpan = import('../../src/tracing/cls').InstanaBaseSpan;
/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */
export class MatchResult {
    /**
     * @param {Array.<InstanaBaseSpan>} items
     * @param {Array.<(span: InstanaBaseSpan) => void> | ((span: InstanaBaseSpan) => void)} expectations
     */
    constructor(items: Array<InstanaBaseSpan>, expectations: ((span: InstanaBaseSpan) => void)[] | ((span: InstanaBaseSpan) => void));
    items: import("../../src/tracing/cls").InstanaBaseSpan[];
    expectations: ((span: InstanaBaseSpan) => void)[] | ((span: InstanaBaseSpan) => void);
    /** @type {Array.<InstanaBaseSpan>} */
    matches: Array<InstanaBaseSpan>;
    saveBestMatch: boolean;
    bestMatchPassed: number;
    getItems(): import("../../src/tracing/cls").InstanaBaseSpan[];
    getExpectations(): ((span: InstanaBaseSpan) => void)[] | ((span: InstanaBaseSpan) => void);
    getMatches(): import("../../src/tracing/cls").InstanaBaseSpan[];
    /**
     * @param {InstanaBaseSpan} item
     */
    addMatch(item: InstanaBaseSpan): void;
    getError(): any;
    /**
     * @param {*} error
     */
    setError(error: any): void;
    error: any;
    isSaveBestMatch(): boolean;
    getBestMatch(): import("../../src/tracing/cls").InstanaBaseSpan;
    /**
     * @param {InstanaBaseSpan} bestMatch
     */
    setBestMatch(bestMatch: InstanaBaseSpan): void;
    bestMatch: import("../../src/tracing/cls").InstanaBaseSpan;
    getBestMatchPassed(): number;
    /**
     * @param {number} bestMatchPassed
     */
    setBestMatchPassed(bestMatchPassed: number): void;
    getFailedExpectation(): (span: InstanaBaseSpan) => void;
    /**
     * @param {(span: InstanaBaseSpan) => void} failedExpectation
     */
    setFailedExpectation(failedExpectation: (span: InstanaBaseSpan) => void): void;
    failedExpectation: (span: InstanaBaseSpan) => void;
}
