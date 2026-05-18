# OTLP Transformation - Step-by-Step Guide

## Current Structure Analysis

```
Instana Span Creation
        ↓
Backend Mapper (mapper.js)
        ↓
Span Buffer (spanBuffer.js)
        ↓
[OTLP_FORMAT Check]
        ↓
OTLP Mapper (otlp_mapper/mapper.js)
        ↓
OTLP Transformer (otlpTransformer.js)
        ↓
Agent Connection (agentConnection.js)
        ↓
Backend (Port 4318)
```

---

## Step 1: Span Creation
**File**: Instrumentation modules (e.g., HTTP, Kafka, Database)

**Input**: Application activity (HTTP request, DB query, etc.)

**Output**: Instana span object
```javascript
{
  t: "trace-id",
  s: "span-id",
  p: "parent-id",
  n: "node.http.server",
  k: 1,
  ts: 1234567890123,
  d: 45,
  ec: 0,
  data: {
    http: {
      method: "GET",
      url: "/api/users",
      status: 200
    }
  }
}
```

**Cleanup**: None needed - this is the entry point

---

## Step 2: Backend Mapper
**File**: `packages/core/src/tracing/backend_mappers/mapper.js`

**Purpose**: Normalize internal field names to backend field names

**Transformation**:
```javascript
// Before
data.redis.operation = "GET"

// After
data.redis.command = "GET"
```

**Cleanup**: 
- ✅ Already clean
- ✅ Single responsibility
- ✅ Simple field mapping

---

## Step 3: Span Buffer
**File**: `packages/core/src/tracing/spanBuffer.js`

**Purpose**: Collect and batch spans before transmission

**Key Logic** (line 461):
```javascript
const processedSpans = 
  process.env.INSTANA_OTLP_FORMAT === 'true' 
    ? otlpTransformer.transform(spansToSend) 
    : spansToSend;
```

**Cleanup**:
- ✅ Already clean
- ✅ Clear separation of concerns
- ✅ Simple format check

---

## Step 4: OTLP Mapper (When OTLP_FORMAT=true)
**File**: `packages/core/src/tracing/otlp_mapper/mapper.js`

**Purpose**: Map backend fields to OTLP semantic conventions

**Transformation**:
```javascript
// Before
data.http.method = "GET"

// After
data.http["http.request.method"] = "GET"
```

**Cleanup**:
- create a common json for attr and data and use this in mapper

---

## Step 5: OTLP Transformer
**File**: `packages/core/src/tracing/otlpTransformer.js`

**Purpose**: Transform complete span to OTLP format

**Transformations**:
1. Group spans by resource
2. Convert timestamps (ms → nanoseconds)
3. Map span kinds (Instana → OTLP)
4. Generate span names
5. Create OTLP attributes
6. Build final OTLP structure

**Output**:
```javascript
{
  resourceSpans: [{
    resource: { attributes: [...] },
    scopeSpans: [{
      scope: { name: "@instana/collector" },
      spans: [...]
    }]
  }]
}
```

**Cleanup**:
- remove redundancy
- mapper can deal with kind transformation etc

---

## Step 6: Agent Connection
**File**: `packages/collector/src/agentConnection.js`

**Purpose**: Send data to backend

**Current Issues**:
- ❌ Hardcoded port 4318 (lines 499, 582)
- ❌ Duplicate functions: `sendData()` and `sendOtlpData()`
- ❌ No connection pooling

**Cleanup Needed**:
1. Make OTLP port configurable
2. Merge duplicate send functions
3. Add connection pooling

---

## Simple Test Steps

### 1. Setup
```bash
cd example-apps/otel-exporter-test
npm install
```

### 2. Run with OTLP Format
```bash
INSTANA_OTLP_FORMAT=true OTEL_SERVICE_NAME=test-app npm start
```

### 3. Test Endpoints
```bash
# HTTP + HTTP Exit
curl http://localhost:3000/external-api

# HTTP + Database Exit
curl http://localhost:3000/db

# HTTP + Kafka Exit
curl -X POST http://localhost:3000/kafka -H "Content-Type: application/json" -d '{"test":"data"}'
```

### 4. Verify
- Check console for span output
- Verify OTLP format structure
- Confirm data sent to port 4318

---

## Quick Reference

### Environment Variables
```bash
INSTANA_OTLP_FORMAT=true       # Enable OTLP transformation
OTEL_SERVICE_NAME=my-service   # Set service name (standard OpenTelemetry)
# OR
SERVICE_NAME=my-service        # Set service name (legacy, still supported)
INSTANA_OTLP_PORT=4318         # (After cleanup) Configure OTLP port
```

### Key Files
```
packages/core/src/tracing/
├── backend_mappers/mapper.js      # Step 2: Backend field mapping
├── otlp_mapper/mapper.js          # Step 4: OTLP semantic mapping
├── otlpTransformer.js             # Step 5: Full OTLP transformation
└── spanBuffer.js                  # Step 3: Buffering & format check

packages/collector/src/
├── agentConnection.js             # Step 6: Network transmission
└── agent/opts.js                  # Configuration
```

### Trace Format at Each Step

| Step | Format | Example Field |
|------|--------|---------------|
| 1. Creation | Instana Internal | `data.http.method` |
| 2. Backend Mapper | Instana Backend | `data.redis.command` |
| 3. Buffer | Same as Step 2 | - |
| 4. OTLP Mapper | Instana + OTLP | `data.http["http.request.method"]` |
| 5. OTLP Transform | Full OTLP | `attributes[{key, value}]` |
| 6. Transmission | OTLP JSON | `resourceSpans[...]` |

---

## Summary

**Current State**: ✅ Mostly clean, working implementation

**Cleanup Needed**:
**Cleanup Needed**:

1. Remove debug `console.log`s

2. Create a common structure for:

   * attributes
   * data

   and reuse this across all mappers.

   Cleanup can be done step-by-step:

   * first standardize `data`
   * then standardize `attributes`

3. Make OTLP port configurable

4. Unify send functions

   * separate handling for OTLP and Instana if needed (optional)
