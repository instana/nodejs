# OTLP Transformation Architecture

## Overview

This document describes the architecture and implementation of the OpenTelemetry Protocol (OTLP) transformation layer in the Instana Node.js collector. When `INSTANA_OTLP_FORMAT=true`, spans are transformed from Instana's internal format to OTLP format before transmission to the backend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Instrumentation Layer                        │
│              (HTTP, Kafka, Database, etc.)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ Creates Instana Span
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend Mapper (mapper.js)                    │
│         Maps internal fields → backend field names              │
│         Example: operation → command (for Redis)                │
└────────────────────────┬────────────────────────────────────────┘
                         │ Instana Span (backend format)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Span Buffer (spanBuffer.js)                  │
│         Collects, batches, and manages span lifecycle           │
└────────────────────────┬────────────────────────────────────────┘
                         │ Buffered Spans
                         ▼
                    [OTLP_FORMAT Check]
                         │
         ┌───────────────┴───────────────┐
         │ true                           │ false
         ▼                                ▼
┌─────────────────────┐          ┌──────────────────┐
│  OTLP Mapper        │          │  Send as-is      │
│  (otlp_mapper)      │          │  (Instana fmt)   │
│  Backend → OTLP     │          └──────────────────┘
│  Semantic Conv.     │
└──────────┬──────────┘
           │ OTLP-mapped fields
           ▼
┌─────────────────────────────────────────────────────────────────┐
│              OTLP Transformer (otlpTransformer.js)              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Group spans by resource (PID + Host)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Transform each span:                                  │  │
│  │    - Convert timestamps (ms → nanoseconds)               │  │
│  │    - Map span kind (Instana → OTLP)                      │  │
│  │    - Generate span name                                  │  │
│  │    - Create OTLP attributes array                        │  │
│  │    - Normalize trace ID (32-char hex)                    │  │
│  │    - Set status based on error count                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Create resource attributes                            │  │
│  │    - SDK info, service name, PID, hostname               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Build OTLP structure                                  │  │
│  │    - resourceSpans → scopeSpans → spans                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │ OTLP JSON
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Agent Connection (agentConnection.js)              │
│         POST /v1/traces to localhost:4318                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Transformation Steps

### Step 1: Trace Collection (Instana Span Format)

**Input**: Raw Instana span from instrumentation

```javascript
{
  t: "1234567890abcdef",        // Trace ID
  s: "span123",                 // Span ID
  p: "parent456",               // Parent Span ID (optional)
  n: "node.http.server",        // Span name/type
  k: 1,                         // Kind (1=ENTRY, 2=EXIT, 3=INTERMEDIATE)
  ts: 1234567890123,            // Timestamp (milliseconds)
  d: 45,                        // Duration (milliseconds)
  ec: 0,                        // Error count
  f: {                          // From (resource information)
    e: "12345",                 // PID
    h: "my-hostname"            // Host ID
  },
  data: {                       // Protocol-specific data
    http: {
      method: "GET",
      url: "/api/users",
      status: 200,
      host: "example.com"
    }
  }
}
```

**Location**: Created by instrumentation modules (e.g., `packages/collector/src/tracing/instrumentation/protocols/http.js`)

---

### Step 2: Backend Field Mapping

**Purpose**: Normalize internal field names to backend-expected names

**Transformation**: `packages/core/src/tracing/backend_mappers/mapper.js`

```javascript
// Field mappings configuration
const fieldMappings = {
  redis: {
    operation: 'command'        // operation → command
  },
  kafka: {
    operation: 'access',        // operation → access
    endpoints: 'service'        // endpoints → service
  },
  http: {
    operation: 'method',        // operation → method
    endpoints: 'url',           // endpoints → url
    connection: 'host'          // connection → host
  }
};

// Example transformation
// Before: data.redis.operation = "GET"
// After:  data.redis.command = "GET"
```

---

### Step 3: OTLP Semantic Convention Mapping

**Purpose**: Map backend fields to OTLP semantic convention attributes

**Transformation**: `packages/core/src/tracing/otlp_mapper/mapper.js`

```javascript
// OTLP attribute mappings
const otlpAttributeMappings = {
  http: {
    method: 'http.request.method',
    status: 'http.response.status_code',
    url: 'url.full',
    path: 'url.path',
    host: 'server.address',
    protocol: 'network.protocol.name'
  },
  
  // Database mappings (applies to pg, mysql, mongodb, redis, etc.)
  database: {
    stmt: 'db.statement',
    command: 'db.operation.name',
    host: 'net.peer.name',
    port: 'net.peer.port',
    user: 'db.user',
    db: 'db.name',
    table: 'db.sql.table'
  },
  
  // Messaging mappings (Kafka, etc.)
  messaging: {
    service: 'messaging.destination.name',
    access: 'messaging.operation.type'
  }
};

// Example transformation
// Before: data.http.method = "GET"
// After:  data.http["http.request.method"] = "GET"
```

---

### Step 4: Transform Data Values

**Location**: `packages/core/src/tracing/otlpTransformer.js`

#### 4.1 Timestamp Conversion

```javascript
// Convert milliseconds to nanoseconds (as string)
function msToNano(ms) {
  return String(ms * 1000000);
}

// Example:
// Input:  ts = 1234567890123 (ms)
// Output: startTimeUnixNano = "1234567890123000000" (ns)
```

#### 4.2 Span Kind Mapping

```javascript
// Instana → OTLP span kind mapping
function convertSpanKind(instanaKind, spanType, data) {
  // Standard mappings
  switch (instanaKind) {
    case 1: return 2;  // ENTRY → SERVER
    case 2: return 3;  // EXIT → CLIENT
    case 3: return 1;  // INTERMEDIATE → INTERNAL
    default: return 0; // UNSPECIFIED
  }
  
  // Special case: Kafka
  if (spanType === 'kafka' && data.kafka) {
    if (data.kafka.access === 'send') return 2;    // PRODUCER
    if (data.kafka.access === 'consume') return 3; // CONSUMER
  }
}
```

#### 4.3 Trace ID Normalization

```javascript
// Normalize to 32-character hex string
function normalizeTraceId(traceId) {
  const normalized = String(traceId || '0');
  if (normalized.length === 32) return normalized;
  if (normalized.length > 32) return normalized.slice(-32);
  return normalized.padStart(32, '0');
}

// Example:
// Input:  "1234567890abcdef"
// Output: "00000000000000001234567890abcdef"
```

#### 4.4 Span Name Generation

```javascript
// Generate descriptive span names based on span type
const spanNameRules = {
  'node.http.server': {
    template: data => `${data.method || 'HTTP'} ${data.path_tpl || data.url || '/'}`
  },
  'node.http.client': {
    template: data => data.method || 'HTTP'
  },
  'postgres': {
    template: data => {
      const operation = (data.stmt || '').split(' ')[0] || 'query';
      const db = data.db || '';
      return `pg.query:${operation} ${db}`.trim();
    }
  },
  'kafka': {
    template: data => `${data.access || 'process'} ${data.service || 'unknown'}`
  }
};

// Examples:
// HTTP:     "GET /api/users"
// Postgres: "pg.query:SELECT mydb"
// Kafka:    "send my-topic"
```

#### 4.5 Status Determination

```javascript
// Map error count to OTLP status
function createStatus(errorCount) {
  if (errorCount > 0) {
    return { code: 2 };  // ERROR
  }
  return { code: 1 };    // OK
}
```

---

### Step 5: Add Attributes

**Location**: `packages/core/src/tracing/otlpTransformer.js` - `createAttributes()`

#### 5.1 System Attributes

Automatically added based on span type:

```javascript
const systemAttributeRules = {
  postgres: {
    attributes: [
      { key: 'db.system', value: 'postgresql' }
    ]
  },
  kafka: {
    attributes: [
      { key: 'messaging.system', value: 'kafka' }
    ]
  }
};
```

#### 5.2 Data Attributes

Transform span data to OTLP attribute format:

```javascript
// Attribute value types
attributes.push({
  key: "http.request.method",
  value: { stringValue: "GET" }
});

attributes.push({
  key: "http.response.status_code",
  value: { intValue: 200 }
});

attributes.push({
  key: "feature.enabled",
  value: { boolValue: true }
});
```

#### 5.3 Complete Attributes Example

```javascript
attributes: [
  // System attribute
  { key: "db.system", value: { stringValue: "postgresql" } },
  
  // Mapped attributes from span data
  { key: "db.statement", value: { stringValue: "SELECT * FROM users" } },
  { key: "net.peer.name", value: { stringValue: "localhost" } },
  { key: "net.peer.port", value: { intValue: 5432 } },
  { key: "db.name", value: { stringValue: "mydb" } },
  
  // Unmapped attributes (kept as-is with prefix)
  { key: "pg.custom_field", value: { stringValue: "custom_value" } }
]
```

---

### Step 6: Transform Custom/Additional Attributes

#### 6.1 Unmapped Fields

Fields without explicit mappings are preserved with a prefix:

```javascript
// If no mapping exists for a field
const otlpKey = mappings[field] || `${dataKey}.${field}`;

// Example:
// data.http.custom_header → "http.custom_header"
```

#### 6.2 Complex Values

Objects and arrays are JSON-stringified:

```javascript
if (typeof value === 'object') {
  attributes.push({
    key: otlpKey,
    value: { stringValue: JSON.stringify(value) }
  });
}
```

#### 6.3 Adding New Mappings

To add support for new span types or attributes:

**Option 1: Update OTLP Mapper** (`otlp_mapper/mapper.js`)

```javascript
// Add to otlpAttributeMappings
const otlpAttributeMappings = {
  myNewProtocol: {
    internalField: 'otel.semantic.convention.field',
    anotherField: 'otel.another.field'
  }
};
```

**Option 2: Update System Attributes** (`otlpTransformer.js`)

```javascript
// Add to systemAttributeRules
const systemAttributeRules = {
  myNewProtocol: {
    dataKey: 'myNewProtocol',
    attributes: [
      { key: 'system.type', value: 'myNewProtocol' }
    ]
  }
};
```

**Option 3: Update Span Name Rules** (`otlpTransformer.js`)

```javascript
// Add to spanNameRules
const spanNameRules = {
  'myNewProtocol': {
    dataKey: 'myNewProtocol',
    template: data => `${data.operation} ${data.target}`
  }
};
```

---

### Step 7: Resource Attributes

**Location**: `packages/core/src/tracing/otlpTransformer.js` - `createResourceAttributes()`

```javascript
resource: {
  attributes: [
    // SDK information
    {
      key: "telemetry.sdk.language",
      value: { stringValue: "nodejs" }
    },
    {
      key: "telemetry.sdk.name",
      value: { stringValue: "@instana/collector" }
    },
    
    // Service information
    {
      key: "service.name",
      value: { stringValue: process.env.SERVICE_NAME }
    },
    
    // Process information
    {
      key: "process.pid",
      value: { intValue: 12345 }
    },
    
    // Host information
    {
      key: "host.name",
      value: { stringValue: "my-hostname" }
    }
  ]
}
```

---

### Step 8: Final OTLP Structure

**Output**: Complete OTLP trace format

```javascript
{
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
          { key: "telemetry.sdk.name", value: { stringValue: "@instana/collector" } },
          { key: "service.name", value: { stringValue: "my-service" } },
          { key: "process.pid", value: { intValue: 12345 } },
          { key: "host.name", value: { stringValue: "my-hostname" } }
        ]
      },
      scopeSpans: [
        {
          scope: {
            name: "@instana/collector",
            version: "1.0.0"
          },
          spans: [
            {
              traceId: "00000000000000001234567890abcdef",
              spanId: "span123",
              parentSpanId: "parent456",
              name: "GET /api/users",
              kind: 2,
              startTimeUnixNano: "1234567890123000000",
              endTimeUnixNano: "1234567890168000000",
              attributes: [
                { key: "http.request.method", value: { stringValue: "GET" } },
                { key: "http.response.status_code", value: { intValue: 200 } },
                { key: "url.full", value: { stringValue: "/api/users" } },
                { key: "server.address", value: { stringValue: "example.com" } }
              ],
              status: { code: 1 }
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Configuration Files

### Mapping Configuration Approach

The current implementation uses **code-based configuration** for mappings. For a JSON-based approach, consider:

#### Proposed: `otlp-mappings.json`

```json
{
  "spanKindMappings": {
    "default": {
      "1": 2,
      "2": 3,
      "3": 1
    },
    "kafka": {
      "rules": [
        { "condition": "data.kafka.access === 'send'", "kind": 2 },
        { "condition": "data.kafka.access === 'consume'", "kind": 3 }
      ]
    }
  },
  
  "attributeMappings": {
    "http": {
      "method": "http.request.method",
      "status": "http.response.status_code",
      "url": "url.full",
      "path": "url.path",
      "host": "server.address"
    },
    "database": {
      "stmt": "db.statement",
      "command": "db.operation.name",
      "host": "net.peer.name",
      "port": "net.peer.port"
    }
  },
  
  "systemAttributes": {
    "postgres": [
      { "key": "db.system", "value": "postgresql" }
    ],
    "kafka": [
      { "key": "messaging.system", "value": "kafka" }
    ]
  },
  
  "spanNameTemplates": {
    "node.http.server": "{method} {path_tpl|url|/}",
    "postgres": "pg.query:{stmt[0]} {db}",
    "kafka": "{access} {service}"
  }
}
```

#### Proposed: `backend-mappings.json`

```json
{
  "fieldMappings": {
    "redis": {
      "operation": "command"
    },
    "kafka": {
      "operation": "access",
      "endpoints": "service"
    },
    "http": {
      "operation": "method",
      "endpoints": "url",
      "connection": "host"
    }
  }
}
```

---

## Usage

### Enable OTLP Format

```bash
export INSTANA_OTLP_FORMAT=true
export SERVICE_NAME=my-service
node app.js
```

### Verify Transformation

Check logs for OTLP structure:
```javascript
// In otlpTransformer.js (line 379)
console.log('-----------------', JSON.stringify(otelSpans));
```

### Backend Endpoint

Spans are sent to:
- **Host**: `localhost` (configurable via `agentOpts.host`)
- **Port**: `4318` (OTLP standard port)
- **Path**: `/v1/traces`
- **Method**: `POST`
- **Content-Type**: `application/json; charset=UTF-8`

---

## Testing

### Unit Tests

```bash
# Test OTLP mapper
npm test packages/core/test/tracing/otlp_mapper/mapper_test.js

# Test backend mapper
npm test packages/core/test/tracing/backend_mappers/mapper_test.js

# Test span buffer
npm test packages/core/test/tracing/spanBuffer_test.js
```

### Integration Test

```bash
# Run example app with OTLP format
cd example-apps/otel-exporter-test
INSTANA_OTLP_FORMAT=true npm start
```

---

## Extending the Transformation

### Adding a New Protocol

1. **Add Backend Mapping** (`backend_mappers/mapper.js`):
```javascript
const fieldMappings = {
  myProtocol: {
    internalField: 'backendField'
  }
};
```

2. **Add OTLP Mapping** (`otlp_mapper/mapper.js`):
```javascript
const otlpAttributeMappings = {
  myProtocol: {
    backendField: 'otel.semantic.field'
  }
};
```

3. **Add System Attributes** (`otlpTransformer.js`):
```javascript
const systemAttributeRules = {
  myProtocol: {
    dataKey: 'myProtocol',
    attributes: [
      { key: 'system.type', value: 'myProtocol' }
    ]
  }
};
```

4. **Add Span Name Rule** (`otlpTransformer.js`):
```javascript
const spanNameRules = {
  'myProtocol': {
    dataKey: 'myProtocol',
    template: data => `${data.operation} ${data.target}`
  }
};
```

---

## References

- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [HTTP Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/http/)
- [Database Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/database/)
- [Messaging Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/messaging/)

---

## Troubleshooting

### Spans Not Transforming

1. Check environment variable: `echo $INSTANA_OTLP_FORMAT`
2. Verify check in `spanBuffer.js` line 461
3. Check logs for transformation errors

### Missing Attributes

1. Verify mapping exists in `otlp_mapper/mapper.js`
2. Check if field was mapped in `backend_mappers/mapper.js`
3. Unmapped fields are preserved with prefix

### Incorrect Span Names

1. Check `spanNameRules` in `otlpTransformer.js`
2. Add custom rule for your span type
3. Default: uses span type (`span.n`)

### Backend Connection Issues

1. Verify OTLP collector is running on port 4318
2. Check `agentOpts.host` configuration
3. Review `agentConnection.js` sendData function

---

## Performance Considerations

- **Batching**: Spans are batched before transformation (configurable)
- **Memory**: Buffer size limited by `maxBufferedSpans` config
- **CPU**: Transformation is synchronous but optimized
- **Network**: Single HTTP request per batch

---

## Future Improvements

1. **JSON Configuration**: Move mappings to external JSON files
2. **Dynamic Rules**: Support runtime rule updates
3. **Compression**: Add gzip compression for large payloads
4. **Metrics**: Add transformation metrics (duration, errors)
5. **Validation**: Add OTLP schema validation