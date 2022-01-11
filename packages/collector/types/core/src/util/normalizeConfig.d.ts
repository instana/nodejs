declare function _exports(config?: InstanaConfig): InstanaConfig;
export = _exports;
export type InstanaTracingOption = {
    enabled?: boolean;
    automaticTracingEnabled?: boolean;
    activateImmediately?: boolean;
    forceTransmissionStartingAt?: number;
    maxBufferedSpans?: number;
    transmissionDelay?: number;
    stackTraceLength?: number;
    http?: HTTPTracingOptions;
    disabledTracers?: Array<string>;
    spanBatchingEnabled?: boolean;
    disableAutomaticTracing?: boolean;
    disableW3cTraceCorrelation?: boolean;
    kafka?: KafkaTracingOptions;
};
export type HTTPTracingOptions = {
    extraHttpHeadersToCapture?: Array<string>;
};
export type KafkaTracingOptions = {
    traceCorrelation?: boolean;
    headerFormat?: KafkaTraceCorrelationFormat;
};
export type KafkaTraceCorrelationFormat = 'binary' | 'string' | 'both';
export type InstanaMetricsOption = {
    transmissionDelay?: number;
    timeBetweenHealthcheckCalls?: number;
};
export type InstanaSecretsOption = {
    matcherMode?: string;
    keywords?: Array<string>;
};
export type InstanaConfig = {
    serviceName?: string;
    metrics?: InstanaMetricsOption;
    tracing?: InstanaTracingOption;
    secrets?: InstanaSecretsOption;
    timeBetweenHealthcheckCalls?: number;
};
