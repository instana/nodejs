import { GenericLogger } from '@instana/core/src/core';

export interface AgentConfig {
  tracing?: {
    http?: {
      extraHttpHeadersToCapture?: string[];
    };
    kafka?: {
      traceCorrelation?: boolean;
    };
    spanBatchingEnabled?: boolean | string;
    ignoreEndpoints?: import('@instana/core/src/tracing').IgnoreEndpoints;
    disable?: import('@instana/core/src/tracing').Disable;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface CollectorConfig {
  agentPort?: number;
  agentHost?: string;
  tracing?: {
    stackTraceLength?: number;
    [key: string]: any;
  };
  autoProfile?: boolean | string;
  reportUnhandledPromiseRejections?: boolean;
  logger?: GenericLogger;
  level?: string | number;
}
