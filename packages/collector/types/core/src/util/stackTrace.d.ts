export function captureStackTrace(length: number, referenceFunction: Function, drop?: number): Array<any>;
export function getStackTraceAsJson(length: number, error: InstanaExtendedError): InstanaCallSite[];
export function buildFunctionIdentifier(callSite: NodeJS.CallSite): string;
export type InstanaCallSite = {
    m: string;
    c: string;
    n: number;
};
export type InstanaExtendedError = Error & {
    _jsonStackTrace: Array<InstanaCallSite>;
};
