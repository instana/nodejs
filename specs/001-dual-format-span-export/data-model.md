# Data Model: Span Format Mappings

**Feature**: 001-dual-format-span-export  
**Date**: 2026-04-20  
**Status**: Phase 1 - Design

## Overview

This document defines the complete data model for converting between Instana and OpenTelemetry span formats. It includes field-level mappings, transformation rules, validation constraints, and state transitions.

---

## 1. Core Entities

### 1.1 Instana Span Entity

```typescript
/**
 * Instana span format - compact, abbreviated field names
 * Optimized for network transmission and storage
 */
interface InstanaSpan {
  // === Core Identifiers ===
  t: string;              // Trace ID (128-bit hex, 32 chars)
  s: string;              // Span ID (64-bit hex, 16 chars)
  p?: string;             // Parent Span ID (64-bit hex, 16 chars)
  lt?: string;            // Long Trace ID (W3C compatibility)
  
  // === Span Metadata ===
  n: string;              // Span name/type (e.g., 'node.http.server')
  k: SpanKind;            // Kind: 1=ENTRY, 2=EXIT, 3=INTERMEDIATE
  
  // === Timing (milliseconds) ===
  ts: number;             // Start timestamp (ms since epoch)
  d: number;              // Duration (ms)
  
  // === Error Tracking ===
  ec: number;             // Error count (0 = success)
  
  // === Correlation (EUM) ===
  crtp?: string;          // Correlation type ('web' | 'mobile')
  crid?: string;          // Correlation ID
  
  // === W3C Trace Context ===
  tp?: boolean;           // Trace ID from traceparent header
  
  // === Source Information ===
  f?: {
    e?: string;           // Entity ID (service instance)
    h?: string;           // Host name
    hl?: boolean;         // Host lookup performed
    cp?: string;          // Container process
  };
  
  // === Protocol-Specific Data ===
  data: Record<string, any>;  // Nested by protocol (http, redis, etc.)
  
  // === Additional Metadata ===
  ia?: object;            // Closest Instana ancestor
  sy?: boolean;           // Synthetic marker
  b?: {                   // Batching info
    s?: number;           // Batch size
    d?: number;           // Batch duration
  };
}

type SpanKind = 1 | 2 | 3;  // ENTRY | EXIT | INTERMEDIATE
```

### 1.2 OpenTelemetry Span Entity

```typescript
/**
 * OpenTelemetry span format - verbose, standardized
 * Follows OTel semantic conventions v1.24.0
 */
interface OTelSpan {
  // === Core Identifiers (SpanContext) ===
  traceId: string;              // 128-bit hex (32 chars)
  spanId: string;               // 64-bit hex (16 chars)
  parentSpanId?: string;        // 64-bit hex (16 chars)
  traceFlags: number;           // 1 byte bitmap (0x01 = sampled)
  traceState?: string;          // Vendor trace state (W3C)
  
  // === Span Metadata ===
  name: string;                 // Operation name (e.g., 'GET /api/users')
  kind: OTelSpanKind;           // 0-4: INTERNAL, SERVER, CLIENT, PRODUCER, CONSUMER
  
  // === Timing (nanoseconds) ===
  startTimeUnixNano: number;    // uint64 (ns since epoch)
  endTimeUnixNano: number;      // uint64 (ns since epoch)
  
  // === Attributes (flat key-value) ===
  attributes: Record<string, AttributeValue>;
  droppedAttributesCount?: number;
  
  // === Events ===
  events: Event[];
  droppedEventsCount?: number;
  
  // === Links ===
  links: Link[];
  droppedLinksCount?: number;
  
  // === Status ===
  status: {
    code: StatusCode;           // 0=UNSET, 1=OK, 2=ERROR
    message?: string;           // Error message (if ERROR)
  };
  
  // === Resource (service/host info) ===
  resource?: Resource;
  
  // === Instrumentation Scope ===
  instrumentationScope?: {
    name: string;               // e.g., '@instana/core'
    version?: string;           // e.g., '3.0.0'
    schemaUrl?: string;
  };
}

enum OTelSpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4
}

enum StatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2
}

type AttributeValue = string | number | boolean | string[] | number[] | boolean[];

interface Event {
  timeUnixNano: number;
  name: string;
  attributes: Record<string, AttributeValue>;
  droppedAttributesCount?: number;
}

interface Link {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: Record<string, AttributeValue>;
  droppedAttributesCount?: number;
}

interface Resource {
  attributes: Record<string, AttributeValue>;
  droppedAttributesCount?: number;
}
```

---

## 2. Field Mappings

### 2.1 Core Field Mappings

| Instana Field | OTel Field | Transformation | Validation |
|---------------|------------|----------------|------------|
| `t` | `traceId` | Direct copy | Must be 32 hex chars |
| `s` | `spanId` | Direct copy | Must be 16 hex chars |
| `p` | `parentSpanId` | Direct copy (if present) | Must be 16 hex chars or undefined |
| `n` | `name` | Apply name mapping rules | Must be non-empty string |
| `k` | `kind` | Map via `SPAN_KIND_MAP` | Must be valid OTelSpanKind |
| `ts` | `startTimeUnixNano` | `ts * 1_000_000` | Must be positive integer |
| `ts + d` | `endTimeUnixNano` | `(ts + d) * 1_000_000` | Must be >= startTimeUnixNano |
| `ec` | `status.code` | `ec > 0 ? ERROR : UNSET` | 0, 1, or 2 |
| `ec` | `status.message` | Extract from `data` if available | String or undefined |

### 2.2 Span Kind Mapping

```typescript
const SPAN_KIND_MAP: Record<number, OTelSpanKind> = {
  1: OTelSpanKind.SERVER,      // ENTRY → SERVER
  2: OTelSpanKind.CLIENT,      // EXIT → CLIENT
  3: OTelSpanKind.INTERNAL     // INTERMEDIATE → INTERNAL
};

/**
 * Special case: Messaging spans
 * Need to distinguish PRODUCER vs CONSUMER based on operation
 */
function mapMessagingSpanKind(instanaSpan: InstanaSpan): OTelSpanKind {
  if (instanaSpan.k !== 2) {  // Only for EXIT spans
    return SPAN_KIND_MAP[instanaSpan.k];
  }
  
  // Check messaging operation
  const kafkaAccess = instanaSpan.data.kafka?.access;
  const amqpExchange = instanaSpan.data.amqp?.exchange;
  const sqsQueue = instanaSpan.data.sqs?.queue;
  
  if (kafkaAccess === 'send' || amqpExchange || sqsQueue) {
    return OTelSpanKind.PRODUCER;
  }
  
  if (kafkaAccess === 'consume') {
    return OTelSpanKind.CONSUMER;
  }
  
  return OTelSpanKind.CLIENT;  // Default for EXIT
}
```

### 2.3 Span Name Mapping

```typescript
/**
 * Span name transformation rules
 * Instana uses technical names, OTel uses operation names
 */
const SPAN_NAME_RULES: Record<string, (span: InstanaSpan) => string> = {
  // HTTP Server
  'node.http.server': (span) => {
    const method = span.data.http?.method || 'HTTP';
    const path = span.data.http?.path_tpl || span.data.http?.url || '/';
    return `${method} ${path}`;
  },
  
  // HTTP Client
  'node.http.client': (span) => {
    const method = span.data.http?.method || 'HTTP';
    const url = span.data.http?.url || 'unknown';
    return `${method} ${url}`;
  },
  
  // Redis
  'redis': (span) => {
    const command = span.data.redis?.command || 'UNKNOWN';
    return `redis.${command.toLowerCase()}`;
  },
  
  // DynamoDB
  'dynamodb': (span) => {
    const op = span.data.dynamodb?.op || 'unknown';
    return `dynamodb.${op}`;
  },
  
  // MongoDB
  'mongo': (span) => {
    const command = span.data.mongo?.command || 'unknown';
    return `mongodb.${command}`;
  },
  
  // PostgreSQL
  'postgres': (span) => {
    const stmt = span.data.pg?.stmt || 'query';
    return `postgresql.${stmt}`;
  },
  
  // MySQL
  'mysql': (span) => {
    const stmt = span.data.mysql?.stmt || 'query';
    return `mysql.${stmt}`;
  },
  
  // Kafka
  'kafka': (span) => {
    const access = span.data.kafka?.access;
    return access === 'send' ? 'kafka.send' : 'kafka.receive';
  },
  
  // RabbitMQ
  'rabbitmq': (span) => {
    const exchange = span.data.amqp?.exchange;
    return exchange ? `rabbitmq.publish` : `rabbitmq.consume`;
  },
  
  // gRPC
  'grpc': (span) => {
    const method = span.data.rpc?.call || 'unknown';
    return `grpc.${method}`;
  },
  
  // GraphQL
  'graphql.server': (span) => {
    const operationName = span.data.graphql?.operationName || 'query';
    return `graphql.${operationName}`;
  },
  
  // AWS Lambda
  'aws.lambda.invoke': (span) => {
    const functionName = span.data.lambda?.function || 'unknown';
    return `aws.lambda.invoke.${functionName}`;
  },
  
  // Default fallback
  'default': (span) => span.n
};

function mapSpanName(instanaSpan: InstanaSpan): string {
  const rule = SPAN_NAME_RULES[instanaSpan.n] || SPAN_NAME_RULES.default;
  return rule(instanaSpan);
}
```

### 2.4 Attribute Mappings

#### 2.4.1 HTTP Attributes

```typescript
const HTTP_ATTRIBUTE_MAP = {
  // Instana → OTel
  'method': 'http.method',
  'url': 'http.url',
  'status': 'http.status_code',
  'host': 'net.peer.name',
  'path_tpl': 'http.route',
  'params': 'http.target',
  'header': 'http.request.header',
  'error': 'http.error_message'
};

function mapHttpAttributes(httpData: any): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {};
  
  for (const [instanaKey, otelKey] of Object.entries(HTTP_ATTRIBUTE_MAP)) {
    if (httpData[instanaKey] !== undefined) {
      attributes[otelKey] = httpData[instanaKey];
    }
  }
  
  return attributes;
}
```

#### 2.4.2 Database Attributes

```typescript
const DB_ATTRIBUTE_MAP = {
  // Common database attributes
  'connection': 'db.connection_string',
  'user': 'db.user',
  'name': 'db.name',
  'stmt': 'db.statement',
  
  // Redis-specific
  'command': 'db.operation',
  
  // MongoDB-specific
  'command': 'db.operation',
  'collection': 'db.mongodb.collection',
  
  // SQL-specific
  'stmt': 'db.statement',
  'table': 'db.sql.table'
};

function mapDatabaseAttributes(
  dbType: string,
  dbData: any
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {
    'db.system': dbType  // e.g., 'redis', 'postgresql', 'mongodb'
  };
  
  for (const [instanaKey, otelKey] of Object.entries(DB_ATTRIBUTE_MAP)) {
    if (dbData[instanaKey] !== undefined) {
      attributes[otelKey] = dbData[instanaKey];
    }
  }
  
  return attributes;
}
```

#### 2.4.3 Messaging Attributes

```typescript
const MESSAGING_ATTRIBUTE_MAP = {
  // Kafka
  'service': 'messaging.destination.name',
  'access': 'messaging.operation',
  'key': 'messaging.kafka.message.key',
  'partition': 'messaging.kafka.partition',
  
  // RabbitMQ
  'exchange': 'messaging.destination.name',
  'routingKey': 'messaging.rabbitmq.routing_key',
  'queue': 'messaging.destination.name',
  
  // AWS SQS
  'queue': 'messaging.destination.name',
  'group': 'messaging.consumer.group.name'
};

function mapMessagingAttributes(
  messagingType: string,
  messagingData: any
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {
    'messaging.system': messagingType  // e.g., 'kafka', 'rabbitmq', 'sqs'
  };
  
  for (const [instanaKey, otelKey] of Object.entries(MESSAGING_ATTRIBUTE_MAP)) {
    if (messagingData[instanaKey] !== undefined) {
      attributes[otelKey] = messagingData[instanaKey];
    }
  }
  
  return attributes;
}
```

### 2.5 Resource Attributes

```typescript
/**
 * Extract resource attributes from Instana span
 * Resource represents the service/host information
 */
function extractResourceAttributes(instanaSpan: InstanaSpan): Resource {
  const attributes: Record<string, AttributeValue> = {};
  
  // Service information
  if (instanaSpan.f?.e) {
    attributes['service.instance.id'] = instanaSpan.f.e;
  }
  
  // Host information
  if (instanaSpan.f?.h) {
    attributes['host.name'] = instanaSpan.f.h;
  }
  
  // Container information
  if (instanaSpan.f?.cp) {
    attributes['container.id'] = instanaSpan.f.cp;
  }
  
  return { attributes };
}
```

### 2.6 Trace Context Mapping

```typescript
/**
 * Map W3C trace context fields
 */
function mapTraceContext(instanaSpan: InstanaSpan): {
  traceFlags: number;
  traceState?: string;
} {
  // Trace flags: bit 0 = sampled
  const traceFlags = 0x01;  // Always sampled in Instana
  
  // Trace state: preserve Instana-specific context
  let traceState: string | undefined;
  
  if (instanaSpan.tp || instanaSpan.lt) {
    // Preserve W3C trace context
    const instanaState = `in=${instanaSpan.t}:${instanaSpan.s}`;
    traceState = instanaState;
  }
  
  // Add correlation info to trace state
  if (instanaSpan.crid) {
    const correlationState = `instana-correlation=${instanaSpan.crtp}:${instanaSpan.crid}`;
    traceState = traceState ? `${traceState},${correlationState}` : correlationState;
  }
  
  return { traceFlags, traceState };
}
```

---

## 3. Transformation Rules

### 3.1 Complete Transformation Algorithm

```typescript
function convertInstanaToOTel(instanaSpan: InstanaSpan): OTelSpan {
  // Stage 1: Core fields
  const otelSpan: OTelSpan = {
    traceId: instanaSpan.t,
    spanId: instanaSpan.s,
    parentSpanId: instanaSpan.p,
    name: mapSpanName(instanaSpan),
    kind: mapMessagingSpanKind(instanaSpan),
    startTimeUnixNano: instanaSpan.ts * 1_000_000,
    endTimeUnixNano: (instanaSpan.ts + instanaSpan.d) * 1_000_000,
    attributes: {},
    events: [],
    links: [],
    status: {
      code: instanaSpan.ec > 0 ? StatusCode.ERROR : StatusCode.UNSET
    }
  };
  
  // Stage 2: Trace context
  const { traceFlags, traceState } = mapTraceContext(instanaSpan);
  otelSpan.traceFlags = traceFlags;
  if (traceState) {
    otelSpan.traceState = traceState;
  }
  
  // Stage 3: Attributes from data object
  otelSpan.attributes = flattenDataToAttributes(instanaSpan.data);
  
  // Stage 4: Resource
  otelSpan.resource = extractResourceAttributes(instanaSpan);
  
  // Stage 5: Instrumentation scope
  otelSpan.instrumentationScope = {
    name: '@instana/core',
    version: '3.0.0'  // TODO: Get from package.json
  };
  
  // Stage 6: Preserve Instana-specific fields
  if (instanaSpan.sy) {
    otelSpan.attributes['instana.synthetic'] = true;
  }
  
  if (instanaSpan.b) {
    otelSpan.attributes['instana.batch.size'] = instanaSpan.b.s || 0;
    otelSpan.attributes['instana.batch.duration'] = instanaSpan.b.d || 0;
  }
  
  return otelSpan;
}
```

### 3.2 Data Flattening Algorithm

```typescript
function flattenDataToAttributes(
  data: Record<string, any>
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {};
  
  for (const [protocol, protocolData] of Object.entries(data)) {
    let protocolAttributes: Record<string, AttributeValue>;
    
    switch (protocol) {
      case 'http':
        protocolAttributes = mapHttpAttributes(protocolData);
        break;
      case 'redis':
      case 'mongo':
      case 'postgres':
      case 'mysql':
        protocolAttributes = mapDatabaseAttributes(protocol, protocolData);
        break;
      case 'kafka':
      case 'amqp':
      case 'sqs':
        protocolAttributes = mapMessagingAttributes(protocol, protocolData);
        break;
      default:
        // Generic flattening for unknown protocols
        protocolAttributes = flattenGeneric(protocol, protocolData);
    }
    
    Object.assign(attributes, protocolAttributes);
  }
  
  return attributes;
}

function flattenGeneric(
  prefix: string,
  data: any
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (isAttributeValue(value)) {
      attributes[`${prefix}.${key}`] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Nested object: flatten recursively
      const nested = flattenGeneric(`${prefix}.${key}`, value);
      Object.assign(attributes, nested);
    }
  }
  
  return attributes;
}

function isAttributeValue(value: any): value is AttributeValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
  }
  return false;
}
```

---

## 4. Validation Rules

### 4.1 Required Fields

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateInstanaSpan(span: InstanaSpan): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!span.t || span.t.length !== 32) {
    errors.push('Invalid or missing trace ID (must be 32 hex chars)');
  }
  
  if (!span.s || span.s.length !== 16) {
    errors.push('Invalid or missing span ID (must be 16 hex chars)');
  }
  
  if (!span.n) {
    errors.push('Missing span name');
  }
  
  if (![1, 2, 3].includes(span.k)) {
    errors.push('Invalid span kind (must be 1, 2, or 3)');
  }
  
  if (typeof span.ts !== 'number' || span.ts <= 0) {
    errors.push('Invalid timestamp (must be positive number)');
  }
  
  if (typeof span.d !== 'number' || span.d < 0) {
    errors.push('Invalid duration (must be non-negative number)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateOTelSpan(span: OTelSpan): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!span.traceId || span.traceId.length !== 32) {
    errors.push('Invalid or missing traceId');
  }
  
  if (!span.spanId || span.spanId.length !== 16) {
    errors.push('Invalid or missing spanId');
  }
  
  if (!span.name) {
    errors.push('Missing span name');
  }
  
  if (![0, 1, 2, 3, 4].includes(span.kind)) {
    errors.push('Invalid span kind');
  }
  
  if (typeof span.startTimeUnixNano !== 'number' || span.startTimeUnixNano <= 0) {
    errors.push('Invalid startTimeUnixNano');
  }
  
  if (typeof span.endTimeUnixNano !== 'number' || span.endTimeUnixNano < span.startTimeUnixNano) {
    errors.push('Invalid endTimeUnixNano (must be >= startTimeUnixNano)');
  }
  
  if (![0, 1, 2].includes(span.status.code)) {
    errors.push('Invalid status code');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### 4.2 Attribute Constraints

```typescript
const ATTRIBUTE_LIMITS = {
  maxAttributeCount: 128,
  maxAttributeValueLength: 4096,
  maxAttributeKeyLength: 256
};

function validateAttributes(
  attributes: Record<string, AttributeValue>
): ValidationResult {
  const errors: string[] = [];
  
  // Check attribute count
  const count = Object.keys(attributes).length;
  if (count > ATTRIBUTE_LIMITS.maxAttributeCount) {
    errors.push(`Too many attributes: ${count} (max: ${ATTRIBUTE_LIMITS.maxAttributeCount})`);
  }
  
  // Check each attribute
  for (const [key, value] of Object.entries(attributes)) {
    // Key length
    if (key.length > ATTRIBUTE_LIMITS.maxAttributeKeyLength) {
      errors.push(`Attribute key too long: ${key.substring(0, 50)}...`);
    }
    
    // Value length (for strings)
    if (typeof value === 'string' && value.length > ATTRIBUTE_LIMITS.maxAttributeValueLength) {
      errors.push(`Attribute value too long for key: ${key}`);
    }
    
    // Array length
    if (Array.isArray(value) && value.length > 100) {
      errors.push(`Attribute array too long for key: ${key}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 5. State Transitions

### 5.1 Span Lifecycle

```
┌─────────────┐
│   Created   │
│ (Instana)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Completed  │
│  (Instana)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │
│   Mapper    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Format    │────▶│   OTel      │
│  Selection  │     │ Conversion  │
└─────────────┘     └──────┬──────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │ Validation  │
       │            └──────┬──────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│ Transmit    │     │ Transmit    │
│ (Instana)   │     │   (OTel)    │
└─────────────┘     └─────────────┘
```

### 5.2 Conversion States

```typescript
enum ConversionState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

interface ConversionContext {
  state: ConversionState;
  startTime: number;
  endTime?: number;
  error?: Error;
  inputSpan: InstanaSpan;
  outputSpan?: OTelSpan;
}
```

---

## 6. Error Handling

### 6.1 Error Categories

```typescript
enum ConversionErrorType {
  VALIDATION_ERROR = 'validation_error',
  MAPPING_ERROR = 'mapping_error',
  TRANSFORMATION_ERROR = 'transformation_error',
  UNKNOWN_ERROR = 'unknown_error'
}

class ConversionError extends Error {
  constructor(
    public type: ConversionErrorType,
    public message: string,
    public spanId: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}
```

### 6.2 Error Recovery

```typescript
function convertWithErrorHandling(
  instanaSpan: InstanaSpan
): OTelSpan | InstanaSpan {
  try {
    // Validate input
    const validation = validateInstanaSpan(instanaSpan);
    if (!validation.valid) {
      throw new ConversionError(
        ConversionErrorType.VALIDATION_ERROR,
        'Invalid Instana span',
        instanaSpan.s,
        validation.errors
      );
    }
    
    // Convert
    const otelSpan = convertInstanaToOTel(instanaSpan);
    
    // Validate output
    const otelValidation = validateOTelSpan(otelSpan);
    if (!otelValidation.valid) {
      throw new ConversionError(
        ConversionErrorType.TRANSFORMATION_ERROR,
        'Invalid OTel span after conversion',
        instanaSpan.s,
        otelValidation.errors
      );
    }
    
    return otelSpan;
    
  } catch (error) {
    logger.error('Span conversion failed', {
      spanId: instanaSpan.s,
      error: error.message
    });
    
    // Fallback: return original Instana span
    return instanaSpan;
  }
}
```

---

## 7. Performance Considerations

### 7.1 Optimization Strategies

1. **Lazy Attribute Conversion**: Only convert attributes when accessed
2. **Object Pooling**: Reuse OTel span objects
3. **Memoization**: Cache span name mappings
4. **Batch Processing**: Convert multiple spans in parallel

### 7.2 Memory Footprint

| Component | Instana | OTel | Overhead |
|-----------|---------|------|----------|
| Core fields | ~200 bytes | ~300 bytes | +50% |
| Attributes | ~300 bytes | ~500 bytes | +67% |
| Total | ~500 bytes | ~800 bytes | +60% |

---

## 8. Extensibility

### 8.1 Adding New Protocol Mappings

To add a new protocol (e.g., gRPC, WebSocket):

1. Add mapping rules to `SPAN_NAME_RULES`
2. Add attribute mapping function
3. Update `flattenDataToAttributes` switch statement
4. Add validation rules
5. Add tests

### 8.2 Custom Attribute Transformers

```typescript
interface AttributeTransformer {
  protocol: string;
  transform(data: any): Record<string, AttributeValue>;
}

class AttributeTransformerRegistry {
  private transformers = new Map<string, AttributeTransformer>();
  
  register(transformer: AttributeTransformer): void {
    this.transformers.set(transformer.protocol, transformer);
  }
  
  transform(protocol: string, data: any): Record<string, AttributeValue> {
    const transformer = this.transformers.get(protocol);
    return transformer ? transformer.transform(data) : flattenGeneric(protocol, data);
  }
}
```

---

## Summary

This data model provides:
- ✅ Complete field-level mappings between Instana and OTel formats
- ✅ Transformation algorithms for all span types
- ✅ Validation rules and constraints
- ✅ Error handlin