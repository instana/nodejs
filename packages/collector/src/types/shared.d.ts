import { CollectorConfig } from './collector';
import { GenericLogger, SpanHandle, NoopSpanHandle } from '@instana/core/src/core';

export interface Init {
  currentSpan(): SpanHandle | NoopSpanHandle;
  isTracing(): boolean;
  isConnected(): boolean;
  setLogger(logger: GenericLogger): void;
  core: any;
  sharedMetrics: any;
  experimental: any;
  opentracing: any;
  sdk: any;
}

export type InitFunction = {
  (config?: CollectorConfig): Init;
  currentSpan(): SpanHandle | NoopSpanHandle;
  isTracing(): boolean;
  isConnected(): boolean;
  setLogger(logger: GenericLogger): void;
  core: any;
  sharedMetrics: any;
  experimental: any;
  opentracing: any;
  sdk: any;
};
