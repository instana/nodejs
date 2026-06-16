# OTLP (OpenTelemetry Protocol) Converter

This module provides conversion functionality between Instana's internal telemetry format and the OpenTelemetry Protocol (OTLP) format for both traces and metrics.

## Architecture Overview

The OTLP converter is organized into three main components:

```
otlp/
├── common/          # Shared utilities and resource management
├── traces/          # Trace conversion logic
├── metrics/         # Metrics conversion logic
├── types/           # TypeScript definitions
└── examples/        # Sample payloads for testing
```

### Component Structure

#### 1. Common (`common/`)
- **Resource Management**: Handles OTLP resource attributes (service name, SDK info, etc.)
- **Semantic Conventions**: Version-specific mappings for OTLP semantic conventions (v1.23, latest)
- **Context**: Global context management for host ID, PID, and service name

#### 2. Traces (`traces/`)
- **Converter**: Main conversion logic from Instana spans to OTLP format
- **Transformers**: Extract and transform span metadata and attributes
- **Mappers**: Map Instana-specific fields to OTLP equivalents

#### 3. Metrics (`metrics/`)
- **Converter**: Main conversion logic from Instana metrics to OTLP format
- **Transformers**: Extract and transform metric data
- **Utilities**: Helper functions for metric normalization

## Basic Flow

### Trace Conversion Flow

```
Instana Spans (Array)
    ↓
[traces/index.js] Entry point
    ↓
[traces/converter.js] Main conversion logic
    ↓
┌─────────────────────────────────────┐
│ 1. Filter out log spans            │
│ 2. Group spans by resource         │
│ 3. Transform each span:             │
│    - Extract metadata (IDs, times)  │
│    - Extract attributes             │
│ 4. Build resource            │
└─────────────────────────────────────┘
    ↓
OTLP Format: { resourceSpans: [...] }
```

**Key Steps:**
1. **Filtering**: Separates log spans from trace spans
2. **Grouping**: Groups spans by resource attributes (service, host, etc.)
3. **Transformation**: 
   - `spanMetaData.extractSpanMetadata()` - Extracts trace ID, span ID, timestamps, status
   - `spanAttributes.extractSpanAttributes()` - Converts Instana span data to OTLP attributes
4. **Resource Attribution**: Attaches resource information (service name, SDK version, etc.)
5. **Scope Assignment**: Assigns instrumentation scope (`@instana/collector`)

### Metrics Conversion Flow

```
Instana Metrics (Object/Array)
    ↓
[metrics/index.js] Entry point
    ↓
[metrics/converter.js] Main conversion logic
    ↓
┌─────────────────────────────────────┐
│ 1. Normalize input structure        │
│ 2. Flatten nested metrics           │
│ 3. Transform each metric:           │
│    - Extract metric data            │
│    - Apply semantic conventions     │
│ 4. Build resource metrics           │
└─────────────────────────────────────┘
    ↓
OTLP Format: { resourceMetrics: [...] }
```

**Key Steps:**
1. **Normalization**: Handles both array and object input formats
2. **Flattening**: Converts nested metric structures to flat arrays
3. **Transformation**: Converts Instana metric format to OTLP metric data points
4. **Resource Attribution**: Includes infrastructure info (PID, host ID) for metrics
5. **Scope Assignment**: Assigns instrumentation scope

## Key Concepts

### Resource Attributes
Resources represent the entity producing telemetry (e.g., a service, host, or container). Common attributes include:
- `service.name` - Service identifier
- `telemetry.sdk.name` - Always "instana"
- `telemetry.sdk.version` - SDK version
- `telemetry.sdk.language` - Always "nodejs"
- `host.id` - Host identifier (metrics only)
- `process.pid` - Process ID (metrics only)

### Semantic Conventions
The module supports multiple versions of OTLP semantic conventions:
- **v1.23**: Stable version with specific attribute mappings
- **latest**: Most recent semantic convention definitions

Semantic conventions are managed through a base schema with version-specific overrides, allowing flexible adaptation to different OTLP versions.

### Instrumentation Scope
All telemetry is tagged with an instrumentation scope:
- **Name**: `@instana/collector`
- **Version**: Current package version

## Usage

### Traces

```javascript
const traces = require('./traces');

// Initialize with configuration
traces.init({ logger: myLogger });

// Transform Instana spans to OTLP format
const otlpPayload = traces.transform(instanaSpans);
// Returns: { resourceSpans: [...] }
```

### Metrics

```javascript
const metrics = require('./metrics');

// Initialize with configuration
metrics.init({ logger: myLogger });

// Set infrastructure context
metrics.setHostId('host-123');
metrics.setPid(12345);

// Transform Instana metrics to OTLP format
const otlpPayload = metrics.transform(instanaMetrics);
// Returns: { resourceMetrics: [...] }
```

## Error Handling

Both trace and metric converters implement graceful error handling:
- **Traces**: Returns original spans if conversion fails
- **Metrics**: Returns empty `{ resourceMetrics: [] }` if conversion fails
- Individual span/metric failures are logged but don't stop batch processing

## Examples

The `examples/` directory contains sample payloads demonstrating:
- Instana span formats (HTTP, Kafka, MongoDB)
- OTLP span formats (default HTTP, Kafka)
- Batch span processing

These examples are useful for testing and understanding the conversion mappings.

## Related Files

- `types/otel-span.d.ts` - TypeScript definitions for OTLP span structure
- `common/context.js` - Global context management
- `common/semconv/` - Semantic convention version management