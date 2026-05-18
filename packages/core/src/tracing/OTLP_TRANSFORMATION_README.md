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
│  OTLP Converter     │          │  Send as-is      │
│  (converter.js)     │          │  (Instana fmt)   │
│  Instana → OTLP     │          └──────────────────┘
│  Direct Transform   │
└──────────┬──────────┘
           │ OTLP spans
           ▼
┌─────────────────────────────────────────────────────────────────┐
│              OTLP Converter (instana-to-otel-converter.js)      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Convert base span structure:                          │  │
│  │    - Normalize trace ID (16 → 32-char hex)               │  │
│  │    - Normalize span ID (16-char hex)                     │  │
│  │    - Convert timestamps (ms → nanoseconds)               │  │
│  │    - Generate span name from data                        │  │
│  │    - Determine span kind (Instana k → OTLP kind)         │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Transform span data to OTLP attributes:               │  │
│  │    - Apply unified span type configuration               │  │
│  │    - Map fields using semantic conventions               │  │
│  │    - Add additional attributes per span type             │  │
│  │    - Prefix unmapped fields                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Set span status:                                      │  │
│  │    - Check error count (ec > 0 → ERROR)                  │  │
│  │    - Check HTTP status (4xx/5xx → ERROR, 2xx → OK)       │  │
│  │    - Default to OK if no errors                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Add service and error attributes:                     │  │
│  │    - service.name from span data                         │  │
│  │    - error and error.count if ec > 0                     │  │
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

### Step 2: Unified Span Type Configuration

### Step 3: Span Data Conversion

### Step 4: Add Service and Error Attributes

### Step 5: OTLP JSON Format