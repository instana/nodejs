export var traceIdHeaderName: string;
export var traceIdHeaderNameLowerCase: string;
export var spanIdHeaderName: string;
export var spanIdHeaderNameLowerCase: string;
export var traceLevelHeaderName: string;
export var traceLevelHeaderNameLowerCase: string;
export var syntheticHeaderName: string;
export var syntheticHeaderNameLowerCase: string;
export var kafkaTraceContextHeaderNameBinary: string;
export var kafkaTraceLevelHeaderNameBinary: string;
export var kafkaTraceLevelBinaryValueSuppressed: Buffer;
export var kafkaTraceLevelBinaryValueInherit: Buffer;
export var kafkaTraceIdHeaderNameString: string;
export var kafkaSpanIdHeaderNameString: string;
export var kafkaTraceLevelHeaderNameString: string;
export var w3cTraceParent: string;
export var w3cTraceState: string;
export var w3cInstana: string;
export var w3cInstanaEquals: string;
export var serviceNameHeaderName: string;
export var serviceNameHeaderNameLowerCase: string;
export var ENTRY: number;
export var EXIT: number;
export var INTERMEDIATE: number;
export namespace SDK {
    const ENTRY: string;
    const EXIT: string;
    const INTERMEDIATE: string;
}
export namespace sqsAttributeNames {
    const TRACE_ID: string;
    const LEGACY_TRACE_ID: string;
    const SPAN_ID: string;
    const LEGACY_SPAN_ID: string;
    const LEVEL: string;
    const LEGACY_LEVEL: string;
}
export var snsSqsInstanaHeaderPrefixRegex: RegExp;
export function isEntrySpan(span: import('./cls').InstanaBaseSpan): boolean;
export function isExitSpan(span: import('./cls').InstanaBaseSpan): boolean;
export function isIntermediateSpan(span: import('./cls').InstanaBaseSpan): boolean;
