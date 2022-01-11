export function verifyHttpRootEntry({ spans, apiPath, pid, extraTests, testMethod }: HttpRootEntryOptions): InstanaBaseSpan;
export function verifyExitSpan({ spanName, spans, parent, withError, pid, extraTests, testMethod, dataProperty }: ExitSpanOptions): InstanaBaseSpan;
export function verifyHttpExit({ spans, parent, pid, extraTests, testMethod }: HttpExitOptions): InstanaBaseSpan;
export type InstanaBaseSpan = import('../../src/tracing/cls').InstanaBaseSpan;
export type HttpRootEntryOptions = {
    spans: Array<InstanaBaseSpan>;
    apiPath: string;
    pid: string;
    extraTests?: ((span: InstanaBaseSpan) => void)[];
    testMethod?: Function | Function;
};
export type ExitSpanOptions = {
    spanName: string;
    dataProperty: string;
    spans: Array<InstanaBaseSpan>;
    parent: InstanaBaseSpan;
    withError: boolean;
    pid: string;
    extraTests?: ((span: InstanaBaseSpan) => void)[];
    testMethod?: Function | Function;
};
export type HttpExitOptions = {
    spans: Array<InstanaBaseSpan>;
    parent: InstanaBaseSpan;
    pid: string;
    extraTests?: ((span: InstanaBaseSpan) => void)[];
    testMethod?: Function | Function;
};
