/**
 * OpenTelemetry Span Schema
 * 
 * TypeScript definitions for OpenTelemetry span format based on
 * OpenTelemetry Protocol (OTLP) v1.0.0 and semantic conventions v1.24.0
 * 
 * @module contracts/opentelemetry-span
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/
 * @see https://opentelemetry.io/docs/specs/semconv/
 */

/**
 * OpenTelemetry Span
 * 
 * Represents a single operation within a trace.
 */
export interface OTelSpan {
  /** Trace ID (128-bit, 32 hex characters) */
  traceId: string;
  
  /** Span ID (64-bit, 16 hex characters) */
  spanId: string;
  
  /** Parent span ID (64-bit, 16 hex characters), undefined for root spans */
  parentSpanId?: string;
  
  /** Trace flags (1 byte bitmap, bit 0 = sampled) */
  traceFlags: number;
  
  /** W3C trace state (vendor-specific context) */
  traceState?: string;
  
  /** Operation name */
  name: string;
  
  /** Span kind */
  kind: SpanKind;
  
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  
  /** Span attributes (key-value pairs) */
  attributes: Record<string, AttributeValue>;
  
  /** Number of attributes dropped due to limits */
  droppedAttributesCount?: number;
  
  /** Span events (timestamped log entries) */
  events: SpanEvent[];
  
  /** Number of events dropped due to limits */
  droppedEventsCount?: number;
  
  /** Links to other spans */
  links: SpanLink[];
  
  /** Number of links dropped due to limits */
  droppedLinksCount?: number;
  
  /** Span status */
  status: SpanStatus;
  
  /** Resource attributes (service/host information) */
  resource?: Resource;
  
  /** Instrumentation scope (library information) */
  instrumentationScope?: InstrumentationScope;
}

/**
 * Span kind enumeration
 */
export enum SpanKind {
  /** Internal operation (default) */
  INTERNAL = 0,
  
  /** Server-side operation (entry span) */
  SERVER = 1,
  
  /** Client-side operation (exit span) */
  CLIENT = 2,
  
  /** Producer operation (message send) */
  PRODUCER = 3,
  
  /** Consumer operation (message receive) */
  CONSUMER = 4
}

/**
 * Span status
 */
export interface SpanStatus {
  /** Status code */
  code: StatusCode;
  
  /** Optional status message (typically for ERROR status) */
  message?: string;
}

/**
 * Status code enumeration
 */
export enum StatusCode {
  /** Default status - operation not explicitly set */
  UNSET = 0,
  
  /** Operation completed successfully */
  OK = 1,
  
  /** Operation failed */
  ERROR = 2
}

/**
 * Attribute value types
 */
export type AttributeValue = 
  | string 
  | number 
  | boolean 
  | string[] 
  | number[] 
  | boolean[];

/**
 * Span event (timestamped log entry)
 */
export interface SpanEvent {
  /** Event timestamp in nanoseconds since Unix epoch */
  timeUnixNano: number;
  
  /** Event name */
  name: string;
  
  /** Event attributes */
  attributes: Record<string, AttributeValue>;
  
  /** Number of attributes dropped due to limits */
  droppedAttributesCount?: number;
}

/**
 * Span link (reference to another span)
 */
export interface SpanLink {
  /** Linked span's trace ID */
  traceId: string;
  
  /** Linked span's span ID */
  spanId: string;
  
  /** Linked span's trace state */
  traceState?: string;
  
  /** Link attributes */
  attributes: Record<string, AttributeValue>;
  
  /** Number of attributes dropped due to limits */
  droppedAttributesCount?: number;
}

/**
 * Resource (service/host information)
 */
export interface Resource {
  /** Resource attributes */
  attributes: Record<string, AttributeValue>;
  
  /** Number of attributes dropped due to limits */
  droppedAttributesCount?: number;
}

/**
 * Instrumentation scope (library information)
 */
export interface InstrumentationScope {
  /** Library name (e.g., '@instana/core') */
  name: string;
  
  /** Library version (e.g., '3.0.0') */
  version?: string;
  
  /** Schema URL for semantic conventions */
  schemaUrl?: string;
  
  /** Scope attributes */
  attributes?: Record<string, AttributeValue>;
  
  /** Number of attributes dropped due to limits */
  droppedAttributesCount?: number;
}

/**
 * Common semantic convention attribute keys
 */
export namespace SemanticAttributes {
  // === Service attributes ===
  export const SERVICE_NAME = 'service.name';
  export const SERVICE_VERSION = 'service.version';
  export const SERVICE_INSTANCE_ID = 'service.instance.id';
  export const SERVICE_NAMESPACE = 'service.namespace';
  
  // === Host attributes ===
  export const HOST_NAME = 'host.name';
  export const HOST_ID = 'host.id';
  export const HOST_TYPE = 'host.type';
  export const HOST_ARCH = 'host.arch';
  
  // === Container attributes ===
  export const CONTAINER_ID = 'container.id';
  export const CONTAINER_NAME = 'container.name';
  export const CONTAINER_IMAGE_NAME = 'container.image.name';
  
  // === HTTP attributes ===
  export const HTTP_METHOD = 'http.method';
  export const HTTP_URL = 'http.url';
  export const HTTP_TARGET = 'http.target';
  export const HTTP_HOST = 'http.host';
  export const HTTP_SCHEME = 'http.scheme';
  export const HTTP_STATUS_CODE = 'http.status_code';
  export const HTTP_ROUTE = 'http.route';
  export const HTTP_USER_AGENT = 'http.user_agent';
  
  // === Database attributes ===
  export const DB_SYSTEM = 'db.system';
  export const DB_CONNECTION_STRING = 'db.connection_string';
  export const DB_USER = 'db.user';
  export const DB_NAME = 'db.name';
  export const DB_STATEMENT = 'db.statement';
  export const DB_OPERATION = 'db.operation';
  
  // === Messaging attributes ===
  export const MESSAGING_SYSTEM = 'messaging.system';
  export const MESSAGING_DESTINATION = 'messaging.destination.name';
  export const MESSAGING_OPERATION = 'messaging.operation';
  export const MESSAGING_MESSAGE_ID = 'messaging.message.id';
  export const MESSAGING_CONSUMER_GROUP = 'messaging.consumer.group.name';
  
  // === RPC attributes ===
  export const RPC_SYSTEM = 'rpc.system';
  export const RPC_SERVICE = 'rpc.service';
  export const RPC_METHOD = 'rpc.method';
  
  // === Network attributes ===
  export const NET_PEER_NAME = 'net.peer.name';
  export const NET_PEER_IP = 'net.peer.ip';
  export const NET_PEER_PORT = 'net.peer.port';
  export const NET_HOST_NAME = 'net.host.name';
  export const NET_HOST_IP = 'net.host.ip';
  export const NET_HOST_PORT = 'net.host.port';
  
  // === Exception attributes ===
  export const EXCEPTION_TYPE = 'exception.type';
  export const EXCEPTION_MESSAGE = 'exception.message';
  export const EXCEPTION_STACKTRACE = 'exception.stacktrace';
}

/**
 * Validation constraints for OpenTelemetry spans
 */
export const OTelValidationConstraints = {
  /** Maximum number of attributes per span */
  MAX_ATTRIBUTE_COUNT: 128,
  
  /** Maximum length of attribute keys */
  MAX_ATTRIBUTE_KEY_LENGTH: 256,
  
  /** Maximum length of string attribute values */
  MAX_ATTRIBUTE_VALUE_LENGTH: 4096,
  
  /** Maximum number of events per span */
  MAX_EVENT_COUNT: 128,
  
  /** Maximum number of links per span */
  MAX_LINK_COUNT: 128,
  
  /** Maximum length of span name */
  MAX_SPAN_NAME_LENGTH: 256,
  
  /** Trace ID length (hex characters) */
  TRACE_ID_LENGTH: 32,
  
  /** Span ID length (hex characters) */
  SPAN_ID_LENGTH: 16,
  
  /** Valid trace flags values */
  VALID_TRACE_FLAGS: [0x00, 0x01],  // 0x01 = sampled
  
  /** Valid status codes */
  VALID_STATUS_CODES: [StatusCode.UNSET, StatusCode.OK, StatusCode.ERROR],
  
  /** Valid span kinds */
  VALID_SPAN_KINDS: [
    SpanKind.INTERNAL,
    SpanKind.SERVER,
    SpanKind.CLIENT,
    SpanKind.PRODUCER,
    SpanKind.CONSUMER
  ]
} as const;

/**
 * Helper type for span attribute constraints
 */
export interface AttributeConstraints {
  /** Maximum number of attributes */
  maxCount: number;
  
  /** Maximum key length */
  maxKeyLength: number;
  
  /** Maximum value length (for strings) */
  maxValueLength: number;
  
  /** Whether to truncate values that exceed limits */
  truncateOnLimit: boolean;
  
  /** Whether to drop attributes that exceed limits */
  dropOnLimit: boolean;
}

/**
 * Default attribute constraints
 */
export const DefaultAttributeConstraints: AttributeConstraints = {
  maxCount: OTelValidationConstraints.MAX_ATTRIBUTE_COUNT,
  maxKeyLength: OTelValidationConstraints.MAX_ATTRIBUTE_KEY_LENGTH,
  maxValueLength: OTelValidationConstraints.MAX_ATTRIBUTE_VALUE_LENGTH,
  truncateOnLimit: true,
  dropOnLimit: false
};
