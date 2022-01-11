export function init(config: import('../util/normalizeConfig').InstanaConfig): void;
export function getStackTrace(referenceFunction: Function, drop?: number): Array<any>;
export function generateRandomTraceId(): string;
export function generateRandomLongTraceId(): string;
export function generateRandomSpanId(): string;
export function generateRandomId(length: number): string;
export function readTraceContextFromBuffer(buffer: Buffer): {
    t: string;
    s: string;
};
export function unsignedHexStringToBuffer(hexString: string, buffer: Buffer, offsetFromRight: number): Buffer;
export function unsignedHexStringsToBuffer(traceId: string, spanId: string): Buffer;
export function renderTraceContextToBuffer(span: import('./cls').InstanaBaseSpan): Buffer;
export function getErrorDetails(err: Error): string;
export function shortenDatabaseStatement(stmt: string): string;
export function readAttribCaseInsensitive(object: any, key: string): any;
export function requireModuleFromApplicationUnderMonitoringSafely(basePath: string, relativePath_0: string): any;
