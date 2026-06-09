# OTLP Converter

Converts Instana spans to OpenTelemetry Protocol (OTLP) format.

## Flow

```
Instana Spans
      ↓
  index.js (entry point)
      ↓
  converter.js
      ↓
  ┌─────────────────────────────────┐
  │                                 │
  ↓                                 ↓
transformers/                   mappers/
  ├─ spanMetaData                 ├─ spanName
  ├─ spanAttributes               ├─ spanAttributes
  └─ resourceAttributes           └─ helper
      ↓                                 ↓
      └─────────────┬───────────────────┘
                    ↓
            OTLP ResourceSpans
```

## Components

### Entry Point
- **index.js**: Main entry with `transform()` methodx

### Core Converter
- **converter.js**: Orchestrates conversion, groups spans by resource

### Transformers
- **spanMetaData**: Extracts trace ID, span ID, timestamps, duration, kind, name, status
- **spanAttributes**: Extracts span-specific attributes (HTTP, database, messaging, etc.)
- **resourceAttributes**: Extracts service name, SDK info

### Mappers
- **spanName**: Generates OTLP span names from Instana span data
- **spanAttributes**: Maps Instana attributes to OTLP semantic conventions
- **helper**: Utility functions for conversions (IDs, timestamps, status, kind)

### Supporting
- **constants.js**: Span types, status codes, span kinds, instrumentation scope name
- **semconv/**: Semantic convention version management (v1.23, latest)
- **util.js**: Helper functions (formatOTLPValue, combineHostPort, etc.)


## Semantic Conventions

Supports multiple OTLP semantic convention versions:
- **v1.23** (default)
- **latest** (v1.41.0)

Version-specific overrides in `semconv/` directory.