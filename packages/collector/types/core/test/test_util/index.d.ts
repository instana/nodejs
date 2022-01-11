declare const _exports: {
    verifyHttpRootEntry: ({ spans, apiPath, pid, extraTests, testMethod }: commonVerifications.HttpRootEntryOptions) => import("../../src/tracing/cls").InstanaBaseSpan;
    verifyExitSpan: ({ spanName, spans, parent, withError, pid, extraTests, testMethod, dataProperty }: commonVerifications.ExitSpanOptions) => import("../../src/tracing/cls").InstanaBaseSpan;
    verifyHttpExit: ({ spans, parent, pid, extraTests, testMethod }: commonVerifications.HttpExitOptions) => import("../../src/tracing/cls").InstanaBaseSpan;
    getCircularList: <T>(arr: T[]) => () => T;
    delay: (ms: number) => Promise<void>;
    expectAtLeastOneMatching: Function;
    expectExactlyNMatching: (items: import("../../src/tracing/cls").InstanaBaseSpan[], n: number, expectations: (span: import("../../src/tracing/cls").InstanaBaseSpan) => void) => import("../../src/tracing/cls").InstanaBaseSpan[];
    expectExactlyOneMatching: Function;
    getSpansByName: (arr: import("../../src/tracing/cls").InstanaBaseSpan[], name: string) => import("../../src/tracing/cls").InstanaBaseSpan[];
    retry: (fn: (value: any) => any, time?: number, until?: number) => Function | Promise<any>;
    retryUntilSpansMatch: (agentControls: any, fn: Function) => Function | Promise<any>;
    sendToParent: (message: any) => void;
    stringifyItems: Function;
};
export = _exports;
import commonVerifications = require("./common_verifications");
