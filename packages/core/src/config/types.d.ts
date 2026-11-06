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

export interface SamplingConfig {
  enable?: boolean;
  rate?: number;
  type?: number;
  threshold?: number | string;
  precision?: number;
}
