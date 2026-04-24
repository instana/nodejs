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
    global?: {
      stackTrace?: string;
      stackTraceLength?: number;
    };
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
  /**
   * Disables sending 'instana.collector.initialized' event.
   * This prevents interference with application-level communication channels.
   * @default false (event is sent by default, except when using NODE_OPTIONS pre-require)
   */
  disableCollectorInitEvent?: boolean;
}
