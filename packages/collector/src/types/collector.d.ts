import { GenericLogger } from '@instana/core/src/core';

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
