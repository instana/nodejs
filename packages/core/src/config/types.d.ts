export interface IgnoreEndpoints {
  [key: string]: IgnoreEndpointsFields[];
}

export interface IgnoreEndpointsFields {
  methods?: string[];
  endpoints?: string[];
  connections?: string[];
}

export interface TracingDisableOptions {
  instrumentations?: string[];
  groups?: string[];
}

export type Disable = TracingDisableOptions | boolean;

export interface MetricsDisableOptions {
  enabled?: boolean;
}
