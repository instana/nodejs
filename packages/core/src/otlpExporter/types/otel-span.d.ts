/*
 * (c) Copyright IBM Corp. 2026
 */

// TODO: The type is not defined yet, this needs to be fixed after approving design and before merging the PR
// ignore this file from initial review

export interface OtelAttributeValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: number;
  doubleValue?: number;
  arrayValue?: object;
  kvlistValue?: object;
  bytesValue?: string;
}

export interface OtelAttribute {
  /** The attribute key */
  key: string;
  /** The attribute value */
  value: OtelAttributeValue;
}

/**
 * OpenTelemetry Resource
 * Resource information associated with spans
 */
export interface OtelResource {
  /** Resource attributes array */
  attributes: OtelAttribute[];
}

/**
 * OpenTelemetry Span Status
 * Represents the status of a span
 */
export interface OtelSpanStatus {
  /** Status code (0=UNSET, 1=OK, 2=ERROR) */
  code?: number;
  /** Status message */
  message?: string;
}

/**
 * OpenTelemetry Span Event
 * Represents a time-stamped event in a span
 */
export interface OtelSpanEvent {
  /** Event timestamp in nanoseconds since Unix epoch */
  timeUnixNano: string;
  /** Event name */
  name: string;
  /** Event attributes */
  attributes?: OtelAttribute[];
  /** Number of dropped attributes */
  droppedAttributesCount?: number;
}

/**
 * OpenTelemetry Span Link
 * Links to other spans in distributed traces
 */
export interface OtelSpanLink {
  /** Trace ID of the linked span */
  traceId: string;
  /** Span ID of the linked span */
  spanId: string;
  /** W3C trace state */
  traceState?: string;
  /** Link attributes */
  attributes?: OtelAttribute[];
  /** Number of dropped attributes */
  droppedAttributesCount?: number;
}

/**
 * OpenTelemetry Span
 *
 * Represents a span in OpenTelemetry format following the OTLP specification.
 * This is the main span structure used when converting from Instana format.
 *
 * @see https://opentelemetry.io/docs/specs/otlp/
 */
export interface OtelSpan {
  /** Trace ID (32 hex characters for 128-bit ID) */
  traceId?: string;

  /** Span ID (16 hex characters for 64-bit ID) */
  spanId?: string;

  /** W3C trace state */
  traceState?: string;

  /** Parent span ID (16 hex characters) */
  parentSpanId?: string;

  /** Span name */
  name?: string;

  /**
   * Span kind
   * - 0: UNSPECIFIED
   * - 1: INTERNAL
   * - 2: SERVER
   * - 3: CLIENT
   * - 4: PRODUCER
   * - 5: CONSUMER
   */
  kind?: number;

  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano?: string;

  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano?: string;

  /** Span attributes as array of key-value pairs */
  attributes: OtelAttribute[];

  /** Number of dropped attributes */
  droppedAttributesCount?: number;

  /** Span events */
  events: OtelSpanEvent[];

  /** Number of dropped events */
  droppedEventsCount?: number;

  /** Span links */
  links: OtelSpanLink[];

  /** Number of dropped links */
  droppedLinksCount?: number;

  /** Span status */
  status?: OtelSpanStatus;

  /**
   * Resource information
   * Note: During conversion, this is attached to individual spans,
   * but in the final OTLP format it's moved to the resourceSpans level
   */
  resource?: OtelResource;
}
