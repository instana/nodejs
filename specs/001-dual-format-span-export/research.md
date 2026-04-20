# Research: Dual-Format Span Export (Instana and OTel)

**Date**: 2026-04-20  
**Feature**: 001-dual-format-span-export  
**Status**: Phase 0 Complete

## Executive Summary

This research document consolidates findings on both Instana and OpenTelemetry span formats, identifies key mapping patterns, and proposes an efficient conversion strategy. The analysis reveals significant structural differences that require careful mapping, but also identifies opportunities for zero-copy optimizations and reusable transformation patterns.

---

## 1. Instana Span Format Analysis

### 1.1 Core Span Structure

Based on analysis of `packages/core/src/core.d.ts` and related files, the Instana span format uses a compact, abbreviated field naming convention:

```typescript
interface InstanaBaseSpan {
  // Core identifiers
  t?: string;           // trace ID (128-bit hex string)
  s?: string;           // span ID (64-bit hex string)
  p?: string;           // parent span ID (64-bit hex string)
  lt?: string;          // long trace ID (for W3C traceparent compatibility)
  
  // Span metadata
  n?: string;           // span name/type (e.g., 'node.http.server', 'redis', 'dynamodb')
  k?: number;           // span kind (1=ENTRY, 2=EXIT, 3=INTERMEDIATE)
  
  // Timing
  ts?: number;          // timestamp (milliseconds since epoch)
  d?: number;           // duration (milliseconds)
  
  // Error tracking
  ec?: number;          // error count
  _ec?: number;         // internal error count
  ecHasBeenSetManually?: boolean;
  
  // Correlation (EUM integration)
  crtp?: string;        // correlation type ('web' or 'mobile')
  crid?: string;        // correlation ID
  
  // W3C trace context
  tp?: boolean;         // trace ID is from traceparent header
  
  // Source information
  f?: {                 // from section
    e?: string;         // entity ID
    h?: string;         // host
    hl?: boolean;       // host lookup
    cp?: string;        // container process
  };
  
  // Additional metadata
  ia?: object;          // closest Instana ancestor span
  sy?: boolean;         // synthetic marker
  pathTplFrozen?: boolean;
  transmitted?: boolean;
  manualEndMode?: boolean;
  stack?: any;          // stack trace
  
  // Span data (protocol/operation-specific)
  data?: Record<string, any>;
  
  // Batching
  b?: {
    s?: number;         // batch size
    d?: number;         // batch duration
  };
  
  // GraphQL destination
  gqd?: any;
  
  // Methods (not serialized)
  transmit?: () => void;
  freezePathTemplate?: () => void;
  disableAutoEnd?: () => void;
  transmitManual?: () => void;
  cancel?: () => void;
  addCleanup?: (callback: () => void) => void;
  cleanup?: () => void;
}
```

### 1.2 Span Kind Enumeration

```javascript
// From packages/core/src/tracing/constants.js
ENTRY = 1;           // Server/consumer span
EXIT = 2;            // Client/producer span
INTERMEDIATE = 3;    // Internal/local span
```

### 1.3 Span Data Structure

The `data` field contains protocol-specific information organized by span type:

```javascript
// Examples from codebase analysis:
span.data = {
  http: {
    method: 'GET',
    url: '/api/users',
    status: 200,
    host: 'example.com'
  },
  redis: {
    command: 'GET',
    connection: 'localhost:6379'
  },
  dynamodb: {
    op: 'GetItem',
    table: 'Users'
  },
  kafka: {
    access: 'send',
    service: 'broker1:9092'
  }
}
```

### 1.4 Backend Field Mapping

Instana uses a backend mapper system (`packages/core/src/tracing/backend_mappers/mapper.js`) that transforms internal field names to backend-expected names:

```javascript
const fieldMappings = {
  dynamodb: {
    operation: 'op'  // internal 'operation' → backend 'op'
  },
  redis: {
    operation: 'command'
  },
  kafka: {
    operation: 'access',
    endpoints: 'service'
  },
  http: {
    operation: 'method',
    endpoints: 'url',
    connection: 'host'
  }
};
```

**Key Insight**: This mapper runs BEFORE transmission, meaning internal spans use normalized field names that are transformed just before sending to backend.

---

## 2. OpenTelemetry Span Format Analysis

### 2.1 Core Span Structure

Based on OpenTelemetry specification (v1.x):

```typescript
interface OTelSpan {
  // Identifiers (SpanContext)
  traceId: string;              // 128-bit (32 hex chars)
  spanId: string;               // 64-bit (16 hex chars)
  parentSpanId?: string;        // 64-bit (16 hex chars)
  traceFlags: number;           // 1 byte bitmap (0x01 = sampled)
  traceState?: string;          // vendor-specific trace state
  
  // Span metadata
  name: string;                 // operation name
  kind: SpanKind;               // enum: INTERNAL, SERVER, CLIENT, PRODUCER, CONSUMER
  
  // Timing (nanoseconds since Unix epoch)
  startTimeUnixNano: number;    // uint64
  endTimeUnixNano: number;      // uint64
  
  // Attributes (key-value pairs)
  attributes: Attributes;       // Map<string, AttributeValue>
  
  // Events
  events: Event[];              // Array of timestamped events
  
  // Links
  links: Link[];                // Links to other spans
  
  // Status
  status: Status;               // { code: StatusCode, message?: string }
  
  // Resource (not part of span, but associated)
  resource?: Resource;          // Service/host information
  
  // Instrumentation scope
  instrumentationScope?: {
    name: string;
    version?: string;
    schemaUrl?: string;
  };
}

enum SpanKind {
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

interface Event {
  timeUnixNano: number;
  name: string;
  attributes: Attributes;
  droppedAttributesCount?: number;
}

interface Link {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: Attributes;
  droppedAttributesCount?: number;
}
```

### 2.2 Attribute Value Types

OpenTelemetry supports the following attribute value types:
- `string`
- `boolean`
- `int64`
- `double`
- `array` (of primitive types)

### 2.3 Semantic Conventions

OTel uses semantic conventions for attribute naming:
- **Namespaced**: `http.method`, `db.system`, `messaging.operation`
- **Lowercase with dots**: `service.name`, `net.peer.name`
- **Standardized values**: `http.method` = "GET" (uppercase), `db.system` = "redis" (lowercase)

### 2.4 Timestamp Precision

- **Instana**: Milliseconds since Unix epoch (JavaScript `Date.now()`)
- **OTel**: Nanoseconds since Unix epoch (uint64)
- **Conversion**: `otelNano = instanaMs * 1_000_000`

---

## 3. Key Mapping Patterns

### 3.1 Field-Level Mappings

| Instana Field | OTel Field | Transformation | Notes |
|---------------|------------|----------------|-------|
| `t` | `traceId` | Direct copy | Both 128-bit hex strings |
| `s` | `spanId` | Direct copy | Both 64-bit hex strings |
| `p` | `parentSpanId` | Direct copy | Both 64-bit hex strings |
| `n` | `name` | Map span type to operation name | Requires lookup table |
| `k` | `kind` | Map kind enum | 1→SERVER, 2→CLIENT, 3→INTERNAL |
| `ts` | `startTimeUnixNano` | `ts * 1_000_000` | ms → ns conversion |
| `d` | `endTimeUnixNano` | `(ts + d) * 1_000_000` | Calculate end time |
| `ec` | `status.code` | `ec > 0 ? ERROR : OK` | Error count → status |
| `data.*` | `attributes` | Flatten and namespace | Complex transformation |
| `f.e` | `resource.attributes['service.instance.id']` | Move to resource | |
| `f.h` | `resource.attributes['host.name']` | Move to resource | |
| `crtp`, `crid` | `attributes['instana.correlation.*']` | Custom attributes | |
| `tp`, `lt` | `traceState` | W3C trace context | Preserve in traceState |

### 3.2 Span Kind Mapping

```javascript
const INSTANA_TO_OTEL_KIND = {
  1: 1,  // ENTRY → SERVER
  2: 2,  // EXIT → CLIENT
  3: 0   // INTERMEDIATE → INTERNAL
};
```

**Special Cases**:
- Messaging spans: Need to distinguish PRODUCER (send) vs CONSUMER (receive)
- Check `span.data.kafka.access` or `span.data.amqp.exchange` to determine

### 3.3 Span Name Mapping

Instana uses technical span names (e.g., `node.http.server`), while OTel prefers operation names (e.g., `GET /api/users`).

**Strategy**: Use lookup table + dynamic generation:

```javascript
const SPAN_NAME_PATTERNS = {
  'node.http.server': (span) => `${span.data.http.method} ${span.data.http.path_tpl || span.data.http.url}`,
  'node.http.client': (span) => `${span.data.http.method} ${span.data.http.url}`,
  'redis': (span) => `redis.${span.data.redis.command}`,
  'dynamodb': (span) => `dynamodb.${span.data.dynamodb.op}`,
  'kafka': (span) => span.data.kafka.access === 'send' ? 'kafka.send' : 'kafka.receive',
  // ... more patterns
};
```

### 3.4 Attribute Transformation

**Challenge**: Instana's nested `data` object must be flattened into OTel's flat attributes with semantic convention namespaces.

**Example**:
```javascript
// Instana
{
  data: {
    http: {
      method: 'GET',
      url: '/api/users',
      status: 200,
      host: 'example.com'
    }
  }
}

// OTel
{
  attributes: {
    'http.method': 'GET',
    'http.url': '/api/users',
    'http.status_code': 200,
    'net.peer.name': 'example.com'
  }
}
```

**Transformation Rules**:
1. Prefix with protocol/system name (e.g., `http.`, `db.`, `messaging.`)
2. Apply semantic convention naming (e.g., `status` → `status_code`)
3. Move connection info to `net.*` namespace
4. Preserve custom tags under `instana.custom.*` namespace

---

## 4. Efficient Conversion Approach

### 4.1 Conversion Architecture

**Decision**: Implement conversion as a **transformation pipeline** with three stages:

```
Stage 1: Core Fields      → Direct mapping (zero-copy where possible)
Stage 2: Attributes       → Flatten and namespace data object
Stage 3: Resource/Scope   → Extract service/host information
```

**Rationale**:
- **Performance**: Separate stages allow early exit if format doesn't need conversion
- **Maintainability**: Each stage has clear responsibility
- **Extensibility**: New stages can be added without affecting existing ones

### 4.2 Schema-Driven Mapping

Use declarative mapping schemas instead of imperative code:

```javascript
const ATTRIBUTE_MAPPINGS = {
  http: {
    method: 'http.method',
    url: 'http.url',
    status: 'http.status_code',
    host: 'net.peer.name',
    path_tpl: 'http.route'
  },
  redis: {
    command: 'db.operation',
    connection: 'db.connection_string'
  },
  // ... more mappings
};
```

**Benefits**:
- Easy to maintain and extend
- Can be loaded from configuration
- Enables validation and testing

### 4.3 Optimization Strategies

#### 4.3.1 Lazy Conversion
Only convert spans when OTel format is requested. If backend expects Instana format, skip conversion entirely.

#### 4.3.2 Object Pooling
Reuse OTel span objects to reduce GC pressure:

```javascript
class OTelSpanPool {
  constructor(size = 100) {
    this.pool = [];
    this.size = size;
  }
  
  acquire() {
    return this.pool.pop() || this.createNew();
  }
  
  release(span) {
    this.reset(span);
    if (this.pool.length < this.size) {
      this.pool.push(span);
    }
  }
}
```

#### 4.3.3 Incremental Conversion
Convert fields on-demand rather than all at once:

```javascript
class LazyOTelSpan {
  constructor(instanaSpan) {
    this._instana = instanaSpan;
    this._attributes = null;  // Computed on first access
  }
  
  get attributes() {
    if (!this._attributes) {
      this._attributes = this.convertAttributes();
    }
    return this._attributes;
  }
}
```

### 4.4 Handling Missing/Extra Fields

**Strategy**: Use a three-tier approach:

1. **Required fields**: Throw error if missing (traceId, spanId, name)
2. **Optional fields**: Use sensible defaults (kind=INTERNAL, status=UNSET)
3. **Extra fields**: Preserve under `instana.*` namespace

```javascript
function handleMissingField(field, span) {
  const defaults = {
    kind: SpanKind.INTERNAL,
    status: { code: StatusCode.UNSET },
    attributes: {},
    events: [],
    links: []
  };
  
  if (field in defaults) {
    return defaults[field];
  }
  
  logger.warn(`Missing required field: ${field} in span ${span.s}`);
  throw new Error(`Required field missing: ${field}`);
}

function preserveExtraFields(instanaSpan, otelSpan) {
  const knownFields = new Set(['t', 's', 'p', 'n', 'k', 'ts', 'd', 'ec', 'data', 'f']);
  
  for (const [key, value] of Object.entries(instanaSpan)) {
    if (!knownFields.has(key) && !key.startsWith('_')) {
      otelSpan.attributes[`instana.${key}`] = value;
    }
  }
}
```

---

## 5. Performance Analysis

### 5.1 Conversion Overhead Estimation

Based on typical span structure:

| Operation | Time (μs) | % of Total |
|-----------|-----------|------------|
| Core field mapping | 0.5 | 10% |
| Attribute flattening | 2.0 | 40% |
| Timestamp conversion | 0.1 | 2% |
| Span name generation | 0.5 | 10% |
| Resource extraction | 0.5 | 10% |
| Object allocation | 1.4 | 28% |
| **Total** | **5.0** | **100%** |

**Target**: <5μs per span (achievable with optimizations)

### 5.2 Memory Overhead

- **Instana span**: ~500 bytes (typical)
- **OTel span**: ~800 bytes (typical)
- **Overhead**: ~300 bytes per span (60% increase)

**Mitigation**: Use object pooling and lazy conversion to reduce peak memory usage.

### 5.3 Throughput Impact

Assuming 10,000 spans/second:
- Conversion time: 10,000 × 5μs = 50ms/sec = 5% CPU overhead
- Within target of <5% performance impact ✅

---

## 6. Configuration Design

### 6.1 Format Selection

```javascript
// Configuration options
{
  tracing: {
    spanFormat: 'instana' | 'opentelemetry',  // Default: 'instana'
    
    // Advanced options
    otel: {
      // Semantic convention version
      semconvVersion: '1.24.0',
      
      // Resource attributes (service info)
      resource: {
        'service.name': 'my-service',
        'service.version': '1.0.0'
      },
      
      // Instrumentation scope
      instrumentationScope: {
        name: '@instana/core',
        version: '3.0.0'
      },
      
      // Attribute limits
      attributeCountLimit: 128,
      attributeValueLengthLimit: 4096,
      
      // Preserve Instana-specific fields
      preserveInstanaFields: true
    }
  }
}
```

### 6.2 Runtime Switching

**Requirement**: Allow format switching without application restart.

**Implementation**: Use configuration hot-reload:

```javascript
class SpanExporter {
  constructor(config) {
    this.config = config;
    this.currentFormat = config.spanFormat;
  }
  
  export(span) {
    // Check for format change
    if (this.config.spanFormat !== this.currentFormat) {
      this.currentFormat = this.config.spanFormat;
      logger.info(`Switched span format to: ${this.currentFormat}`);
    }
    
    const exportSpan = this.currentFormat === 'opentelemetry'
      ? this.convertToOTel(span)
      : span;
    
    this.transmit(exportSpan);
  }
}
```

---

## 7. Extensibility for Future Formats

### 7.1 Format Registry

```javascript
class SpanFormatRegistry {
  constructor() {
    this.formats = new Map();
    this.registerBuiltInFormats();
  }
  
  register(name, converter) {
    this.formats.set(name, converter);
  }
  
  convert(span, targetFormat) {
    const converter = this.formats.get(targetFormat);
    if (!converter) {
      throw new Error(`Unknown format: ${targetFormat}`);
    }
    return converter.convert(span);
  }
  
  registerBuiltInFormats() {
    this.register('instana', new InstanaFormatConverter());
    this.register('opentelemetry', new OTelFormatConverter());
  }
}
```

### 7.2 Converter Interface

```javascript
interface SpanConverter {
  /**
   * Convert an Instana span to the target format
   */
  convert(instanaSpan: InstanaBaseSpan): any;
  
  /**
   * Validate that the converted span is valid
   */
  validate(convertedSpan: any): boolean;
  
  /**
   * Get the format name
   */
  getFormatName(): string;
  
  /**
   * Get the format version
   */
  getFormatVersion(): string;
}
```

### 7.3 Adding New Formats

To add a new format (e.g., Jaeger, Zipkin):

1. Implement `SpanConverter` interface
2. Register with `SpanFormatRegistry`
3. Add configuration options
4. Add tests

**Example**:
```javascript
class JaegerFormatConverter implements SpanConverter {
  convert(instanaSpan) {
    return {
      traceIdLow: instanaSpan.t.slice(16),
      traceIdHigh: instanaSpan.t.slice(0, 16),
      spanId: instanaSpan.s,
      parentSpanId: instanaSpan.p,
      operationName: instanaSpan.n,
      // ... more mappings
    };
  }
  
  validate(span) {
    return span.traceIdLow && span.spanId && span.operationName;
  }
  
  getFormatName() { return 'jaeger'; }
  getFormatVersion() { return '1.0'; }
}

// Register
registry.register('jaeger', new JaegerFormatConverter());
```

---

## 8. Backward Compatibility

### 8.1 Guarantees

1. **Default behavior unchanged**: Instana format remains the default
2. **No breaking changes**: Existing instrumentation continues to work
3. **Opt-in**: OTel format must be explicitly enabled
4. **Graceful degradation**: If conversion fails, fall back to Instana format

### 8.2 Migration Path

For users wanting to adopt OTel format:

1. **Phase 1**: Enable OTel format in test environment
2. **Phase 2**: Validate data in both formats (dual export)
3. **Phase 3**: Switch to OTel format in production
4. **Phase 4**: Disable Instana format (optional)

---

## 9. Observability and Debugging

### 9.1 Conversion Metrics

Track conversion performance and errors:

```javascript
const conversionMetrics = {
  conversionsTotal: 0,
  conversionErrors: 0,
  conversionDurationMs: [],
  
  // Per-format metrics
  byFormat: {
    opentelemetry: {
      conversions: 0,
      errors: 0,
      avgDurationMs: 0
    }
  }
};
```

### 9.2 Debug Logging

```javascript
logger.debug('Converting span to OTel format', {
  spanId: span.s,
  spanName: span.n,
  spanKind: span.k,
  hasData: !!span.data,
  dataKeys: span.data ? Object.keys(span.data) : []
});

logger.debug('Converted span', {
  spanId: otelSpan.spanId,
  name: otelSpan.name,
  kind: otelSpan.kind,
  attributeCount: Object.keys(otelSpan.attributes).length,
  eventCount: otelSpan.events.length
});
```

### 9.3 Validation

Add validation to catch conversion errors early:

```javascript
function validateOTelSpan(span) {
  const errors = [];
  
  if (!span.traceId || span.traceId.length !== 32) {
    errors.push('Invalid traceId');
  }
  
  if (!span.spanId || span.spanId.length !== 16) {
    errors.push('Invalid spanId');
  }
  
  if (!span.name) {
    errors.push('Missing span name');
  }
  
  if (![0, 1, 2, 3, 4].includes(span.kind)) {
    errors.push('Invalid span kind');
  }
  
  if (errors.length > 0) {
    logger.error('OTel span validation failed', { errors, span });
    return false;
  }
  
  return true;
}
```

---

## 10. Alternatives Considered

### 10.1 Direct OTel SDK Integration

**Approach**: Use OpenTelemetry SDK directly instead of converting Instana spans.

**Pros**:
- Native OTel support
- No conversion overhead
- Full OTel feature set

**Cons**:
- Major breaking change
- Requires rewriting all instrumentation
- Loss of Instana-specific features
- High migration cost

**Decision**: Rejected due to backward compatibility requirements.

### 10.2 Dual Instrumentation

**Approach**: Maintain both Instana and OTel instrumentation in parallel.

**Pros**:
- No conversion needed
- Full feature parity

**Cons**:
- Double overhead (2x spans)
- Maintenance burden
- Code duplication

**Decision**: Rejected due to performance and maintenance concerns.

### 10.3 Backend Conversion

**Approach**: Convert spans on the backend instead of in the tracer.

**Pros**:
- Zero client overhead
- Centralized conversion logic

**Cons**:
- Requires backend changes
- Network bandwidth increase (sending both formats)
- Delayed error detection

**Decision**: Rejected as out of scope (backend changes not included).

---

## 11. Recommendations

### 11.1 Implementation Priorities

1. **Phase 0** (This document): Research and design ✅
2. **Phase 1**: Core conversion module
   - Implement `OTelFormatConverter`
   - Add configuration support
   - Create mapping schemas
3. **Phase 2**: Optimization
   - Add object pooling
   - Implement lazy conversion
   - Performance benchmarking
4. **Phase 3**: Testing and validation
   - Unit tests for all mappings
   - Integration tests with real spans
   - Performance tests
5. **Phase 4**: Documentation and rollout
   - API documentation
   - Configuration guide
   - Migration guide (if needed)

### 11.2 Key Decisions

| Decision | Rationale |
|----------|-----------|
| Transformation pipeline architecture | Separation of concerns, extensibility |
| Schema-driven mapping | Maintainability, testability |
| Lazy conversion | Performance optimization |
| Instana format as default | Backward compatibility |
| Format registry pattern | Extensibility for future formats |

### 11.3 Open Questions

1. **OTel Semantic Convention Version**: Which version should we target? (Recommend: latest stable, currently 1.24.0)
2. **Backend Support**: Does the backend need changes to accept OTel format? (Assume: yes, coordinate with backend team)
3. **Test Framework**: Mocha or Jest? (Need to verify from codebase)
4. **Dual Export**: Should we support sending both formats simultaneously? (Recommend: no, for performance reasons)

---

## 12. Next Steps

1. **Review this research** with the team
2. **Resolve open questions** (especially backend coordination)
3. **Create data-model.md** with detailed field mappings
4. **Define contracts** for the conversion module
5. **Begin Phase 1 implementation**

---

## References

- [OpenTelemetry Trace Specification](https://opentelemetry.io/docs/specs/otel/trace/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- Instana Node.js tracer codebase: `packages/core/src/tracing/`
- Backend mapper: `packages/core/src/tracing/backend_mappers/mapper.js`
- Span interface: `packages/core/src/core.d.ts`
