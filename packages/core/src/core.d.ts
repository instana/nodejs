export interface GenericLogger {
  log?: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  [key: string]: any;
  child?: (fields: Record<string, any>) => GenericLogger;
}

export interface InstanaBaseSpan {
  /** trace ID */
  t?: string;
  /** parent span ID */
  p?: string;
  /** span ID */
  s?: string;
  /** type/name */
  n?: string;
  /** kind */
  k?: number;
  /** error count */
  ec?: number;
  /** internal property for error count */
  _ec?: number;
  /** whether the error count has been set manually via the SDK */
  ecHasBeenSetManually?: boolean;
  /** timestamp */
  ts?: number;
  /** duration */
  d?: number;
  /** from section */
  f?: {
    e?: string;
    h?: string;
    hl?: boolean;
    cp?: string;
  };
  /** trace ID is from traceparent header */
  tp?: boolean;
  /** long trace ID */
  lt?: string;
  /** closest Instana ancestor span */
  ia?: object;
  /** correlation type */
  crtp?: string;
  /** correlation ID */
  crid?: string;
  /** synthetic marker */
  sy?: boolean;
  /** pathTplFrozen */
  pathTplFrozen?: boolean;
  /** transmitted */
  transmitted?: boolean;
  /** manualEndMode */
  manualEndMode?: boolean;
  /** stack trace */
  stack?: any;
  /** additional data */
  data?: Record<string, any>;
  /** batching information */
  b?: {
    s?: number;
    d?: number;
  };
  /** GraphQL destination */
  gqd?: any;
  /** function to transmit logs */
  transmit?: () => void;
  /** function to freeze path template */
  freezePathTemplate?: () => void;
  /** function to disable auto end */
  disableAutoEnd?: () => void;
  /** function for manual transmission */
  transmitManual?: () => void;
  /** function to cancel the logger */
  cancel?: () => void;
  /** function to add cleanup operations */
  addCleanup?: (callback: () => void) => void;
  /** function to perform cleanup */
  cleanup?: () => void;
}
