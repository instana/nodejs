import { CollectorConfig } from './collector';
import { GenericLogger, InstanaBaseSpan } from '@instana/core/src/core';

export interface Init {
  currentSpan(): { span: InstanaBaseSpan };
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
  currentSpan(): { span: InstanaBaseSpan };
  isTracing(): boolean;
  isConnected(): boolean;
  setLogger(logger: GenericLogger): void;
  core: any;
  sharedMetrics: any;
  experimental: any;
  opentracing: any;
  sdk: any;
};
