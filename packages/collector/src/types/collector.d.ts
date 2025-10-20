import { GenericLogger } from '@instana/core/src/core';
import { IgnoreEndpoints, Disable } from '@instana/core/src/config/types';

export interface AgentConfig {
  tracing?: {
    http?: {
      extraHttpHeadersToCapture?: string[];
    };
    kafka?: {
      traceCorrelation?: boolean;
    };
    spanBatchingEnabled?: boolean | string;
    ignoreEndpoints?: IgnoreEndpoints;
    disable?: Disable;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface CollectorConfig {
  agentPort?: number;
  agentHost?: string;
  agentRequestTimeout?: number;
  tracing?: {
    stackTraceLength?: number;
    [key: string]: any;
  };
  autoProfile?: boolean | string;
  reportUnhandledPromiseRejections?: boolean;
  logger?: GenericLogger;
  level?: string | number;
}
