# OTLP Logs Signal — Research & Mapping Document

> **Author:** Research for `feat-otlp-exporter`  
> **Scope:** `packages/core/src/otlpExporter/`  
> **Status:** Draft — pre-implementation

---

## 1. Context

The OTLP exporter currently handles two signals:

| Signal  | Entry point                                | Status      |
|---------|--------------------------------------------|-------------|
| Traces  | `traces/converter.js` → `convert(spans)`  | ✅ Implemented |
| Metrics | `metrics/converter.js` → `convert(metrics)` | 🔧 Stub (Phase 2) |
| **Logs**  | _(none — skipped in `traces/converter.js`)_ | 🚫 **TODO** |

Log spans are currently skipped at the hot path in [`traces/converter.js`](./traces/converter.js):

```js
if (isLogSpan(span)) {
  // TODO: Add log span converter
  continue;
}
```

Log spans are identified by [`traces/util.js#isLogSpan`](./traces/util.js):

```js
function isLogSpan(span) {
  if (!span) return false;
  if (span.data && span.data.log) return true;
  if (span.n && typeof span.n === 'string' && span.n.startsWith('log.')) return true;
  return false;
}
```

---

## 2. Instana Log Span Structure

All five logging instrumentations (pino, winston, bunyan, log4js, console) produce spans with **the same shape**. There are no extra fields beyond `message` and `level`.

### 2.1 Shape

```js
{
  // ── Span envelope ──────────────────────────────────────────
  t: "abc123",          // trace ID  (hex string, 16 or 32 chars)
  s: "def456",          // span ID   (hex string, 16 chars)
  p: "789abc",          // parent span ID (hex, optional)
  n: "log.pino",        // span name: one of the values below
  k: 2,                 // kind: always EXIT (2)
  ts: 1706000000000,    // start timestamp (ms)
  d: 0,                 // duration (ms)  — always ~0 for log spans
  ec: 0 | 1,            // error count  (1 for ERROR / FATAL)
  f: { e: "12345", h: "host-id" }, // from / process identity
  stack: [...],         // stack trace array

  // ── Log-specific payload ────────────────────────────────────
  data: {
    log: {
      message: "Something went wrong",   // string
      level:   "error"                   // normalized log level string (see §3)
    }
  }
}
```

### 2.2 Span name values per logger

| Instrumentation file | `span.n` value |
|----------------------|----------------|
| `logging/pino.js`    | `log.pino`     |
| `logging/winston.js` | `log.winston`  |
| `logging/bunyan.js`  | `log.bunyan`   |
| `logging/log4js.js`  | `log.log4js`   |
| `logging/console.js` | `log.console`  |

All start with `log.` — this is exactly what `isLogSpan()` checks via `span.n.startsWith('log.')`.

### 2.3 Normalized log levels

Defined in [`util/constants.js#LOG_LEVEL`](../util/constants.js):

| String value | Priority |
|---|---|
| `trace`  | 10 |
| `debug`  | 20 |
| `info`   | 30 |
| `warn`   | 40 |
| `error`  | 50 |
| `fatal`  | 60 |

`ec = 1` (error count) is set by `tracingUtil.isLogLevelAnError()` when `level === 'error'` or `level === 'fatal'`.

Capture threshold is controlled by config `tracing.captureLogLevel` (default: `warn`), checked by `tracingUtil.shouldCaptureLogSpan()` before the span is even created — so by the time a log span reaches the OTLP exporter, it has already passed the filter.

---

## 3. OTel Log Data Model Reference

From [opentelemetry.io/docs/specs/semconv/general/logs](https://opentelemetry.io/docs/specs/semconv/general/logs/)  
and [opentelemetry.io/docs/concepts/signals/logs](https://opentelemetry.io/docs/concepts/signals/logs/).

### 3.1 OTLP Log Record top-level fields

The OTLP `LogRecord` message (proto: `opentelemetry.proto.logs.v1.LogRecord`) has the following mandatory/optional fields:

| OTLP field               | Type       | Description |
|--------------------------|------------|-------------|
| `timeUnixNano`           | uint64     | Timestamp of the log event (nanoseconds since epoch) |
| `observedTimeUnixNano`   | uint64     | When the log was observed / collected |
| `severityNumber`         | enum (int) | Numeric severity 1–24 (see §3.2) |
| `severityText`           | string     | Human-readable severity string |
| `body`                   | AnyValue   | The log message body |
| `attributes`             | KeyValues  | Structured key-value pairs |
| `traceId`                | bytes/hex  | W3C-compatible 16-byte trace ID |
| `spanId`                 | bytes/hex  | 8-byte span ID |
| `traceFlags`             | uint32     | W3C trace flags |
| `droppedAttributesCount` | uint32     | Count of dropped attributes |
| `eventName`              | string     | (OTel 1.41+) Optional event name |
| `flags`                  | uint32     | Log record flags |

The OTLP **container** structure mirrors traces/metrics:

```json
{
  "resourceLogs": [
    {
      "resource": { "attributes": [...] },
      "scopeLogs": [
        {
          "scope": { "name": "@instana/collector", "version": "..." },
          "logRecords": [ ...LogRecord ]
        }
      ]
    }
  ]
}
```

### 3.2 OTel Severity Number Mapping

| OTel SeverityNumber | Range | Meaning |
|---------------------|-------|---------|
| 1–4                 | TRACE, TRACE2–TRACE4 | Very low level trace |
| 5–8                 | DEBUG, DEBUG2–DEBUG4 | Debug |
| 9–12                | INFO, INFO2–INFO4    | Informational |
| 13–16               | WARN, WARN2–WARN4    | Warning |
| 17–20               | ERROR, ERROR2–ERROR4 | Error |
| 21–24               | FATAL, FATAL2–FATAL4 | Fatal |

The canonical single values per level (no suffix) are: 1, 5, 9, 13, 17, 21.

### 3.3 Semantic Convention Attributes relevant to Logs

From OTel semconv (general/logs + code conventions):

| OTel attribute key   | Description |
|----------------------|-------------|
| `log.record.uid`     | A unique identifier for the log record |
| `log.iostream`       | `stdout` or `stderr` (for console) |
| `code.function`      | Function/method name that emitted the log |
| `code.filepath`      | File path where log was emitted |
| `code.lineno`        | Line number |
| `exception.type`     | Exception class name (for error logs) |
| `exception.message`  | Exception message |
| `exception.stacktrace` | Full exception stacktrace |

---

## 4. Instana → OTLP Log Record Field Mapping

### 4.1 Core Field Mapping Table

| Instana field | OTLP LogRecord field | Transform / Notes |
|---|---|---|
| `span.ts` (ms) | `timeUnixNano` | `span.ts * 1_000_000` → nanoseconds string |
| `span.ts` (ms) | `observedTimeUnixNano` | Same as `timeUnixNano` — Instana does not distinguish observed vs occurred |
| `data.log.level` | `severityNumber` | Map via level→severity table (§4.2) |
| `data.log.level` | `severityText` | Uppercase: `"WARN"`, `"ERROR"`, etc. |
| `data.log.message` | `body` | `{ stringValue: message }` |
| `span.t` | `traceId` | Pad to 32 hex chars (same as trace converter) |
| `span.s` | `spanId` | Pad to 16 hex chars |
| `span.n` | `attributes["log.iostream"]` | `log.console` → infer `"stdout"` / `"stderr"` |
| `span.n` | `attributes["telemetry.sdk.name"]` | Can also go on resource (already done) |
| `span.stack[0]` | `attributes["code.function"]` | Frame function name if stack available |
| `span.stack[0]` | `attributes["code.filepath"]` | Frame file path if stack available |
| `span.stack[0]` | `attributes["code.lineno"]` | Frame line number if stack available |
| `span.ec` | _(drives `severityNumber`)_ | If `ec=1`, severity ≥ ERROR; used as cross-check |
| `span.p` | _(not mapped)_ | Parent span ID has no direct equivalent in LogRecord; context is conveyed via `traceId`/`spanId` |
| `span.d` | _(not mapped)_ | Log records have no duration |
| `span.k` | _(not mapped)_ | Log records have no span kind |

### 4.2 Level → SeverityNumber Mapping Table

| Instana `level` | `severityText` | `severityNumber` | Rationale |
|---|---|---|---|
| `trace` | `TRACE` | 1  | OTel TRACE1 |
| `debug` | `DEBUG` | 5  | OTel DEBUG1 |
| `info`  | `INFO`  | 9  | OTel INFO1  |
| `warn`  | `WARN`  | 13 | OTel WARN1  |
| `error` | `ERROR` | 17 | OTel ERROR1 |
| `fatal` | `FATAL` | 21 | OTel FATAL1 |
| _(unknown)_ | `""` | 0 | OTel SEVERITY_NUMBER_UNSPECIFIED |

### 4.3 Example Transformed Output

**Input Instana log span:**
```json
{
  "t": "abc123def456",
  "s": "1234567890abcdef",
  "p": "fedcba0987654321",
  "n": "log.winston",
  "k": 2,
  "ts": 1706000000000,
  "d": 1,
  "ec": 1,
  "f": { "e": "42", "h": "my-host" },
  "data": {
    "log": {
      "message": "Database connection failed",
      "level": "error"
    }
  }
}
```

**Output OTLP LogRecord:**
```json
{
  "timeUnixNano": "1706000000000000000",
  "observedTimeUnixNano": "1706000000000000000",
  "severityNumber": 17,
  "severityText": "ERROR",
  "body": { "stringValue": "Database connection failed" },
  "traceId": "00000000000000000000abc123def456",
  "spanId": "1234567890abcdef",
  "attributes": []
}
```

**Wrapped in resourceLogs container:**
```json
{
  "resourceLogs": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "my-service" } },
          { "key": "telemetry.sdk.language", "value": { "stringValue": "nodejs" } },
          { "key": "telemetry.sdk.name", "value": { "stringValue": "instana" } },
          { "key": "telemetry.sdk.version", "value": { "stringValue": "3.x.x" } },
          { "key": "process.pid", "value": { "intValue": 42 } },
          { "key": "host.name", "value": { "stringValue": "my-host" } }
        ]
      },
      "scopeLogs": [
        {
          "scope": { "name": "@instana/collector", "version": "3.x.x" },
          "logRecords": [
            {
              "timeUnixNano": "1706000000000000000",
              "observedTimeUnixNano": "1706000000000000000",
              "severityNumber": 17,
              "severityText": "ERROR",
              "body": { "stringValue": "Database connection failed" },
              "traceId": "00000000000000000000abc123def456",
              "spanId": "1234567890abcdef",
              "attributes": []
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 5. Design Decisions & Open Questions

### 5.1 Separate signal vs. unified converter

OTel treats Logs as a **separate signal** from Traces — the OTLP protobuf uses a distinct `ExportLogsServiceRequest` with `resourceLogs`. The current `traces/converter.js` `convert()` function returns `{ resourceSpans: [...] }`.

**Options:**

| Option | Description | Verdict |
|--------|-------------|---------|
| **A: Separate `logs/` module** (mirrors `traces/` and `metrics/`) | New `otlpExporter/logs/converter.js` with `convert(spans)` that returns `{ resourceLogs: [...] }`. Log spans are separated from trace spans before the main loop, or the logs converter is called in parallel. | ✅ **Recommended** — clean signal separation, follows OTel model, easy to test |
| B: Mixed output in traces converter | `traces/converter.js` returns both `resourceSpans` and `resourceLogs` | ❌ Violates OTel signal separation — a single export call cannot mix trace and log payloads in protobuf |
| C: Convert log spans as trace spans | Map `data.log.message` → span name, pretend they are INTERNAL spans | ❌ Lossy — severity, `traceId`, `spanId` on LogRecord serve observability differently than trace spans |

### 5.2 Connector endpoint

Logs use the `/v1/logs` OTLP endpoint (or gRPC `opentelemetry.proto.collector.logs.v1.LogsService`), **separate** from `/v1/traces`. The HTTP exporter path needs to be differentiated. This is a concern for the transport layer (outside this module), but the logs converter must produce `{ resourceLogs }` not `{ resourceSpans }`.

### 5.3 Stack trace → `code.*` attributes

`span.stack` is an array of call frames, populated by `tracingUtil.getStackTrace()`. Frame shape depends on `stackTraceMode` config. If available, the **first meaningful user frame** (not an Instana internal frame) should map to `code.function`, `code.filepath`, `code.lineno`.

Decision: **optional enhancement** — only emit `code.*` attributes if `span.stack` is non-empty. Gate behind a utility function similar to how exceptions map `exception.stacktrace`.

### 5.4 `log.iostream` for console spans

`log.console` spans use `console.error` → `stderr` and `console.warn` / `console.info` → `stdout`. This can be set statically based on `span.n` + `data.log.level`:

```js
// level 'error' on console → stderr, all others → stdout
const iostream = span.n === 'log.console' && span.data.log.level === 'error'
  ? 'stderr'
  : 'stdout';
```

This is a low-priority attribute — mark as **optional**.

### 5.5 `traceFlags`

OTel `traceFlags` is a uint32, bit 0 = sampled. Since Instana has already decided to transmit this span, it is always sampled. Set `traceFlags = 1`.

### 5.6 `observedTimeUnixNano`

Instana does not record "observed" vs "occurred" separately. Use `span.ts * 1_000_000` for both `timeUnixNano` and `observedTimeUnixNano`. Per OTel spec, `observedTimeUnixNano` MUST be set when `timeUnixNano` is unknown — since we always have `ts`, both are set to the same value.

### 5.7 Semconv version handling

The base mappings already include:

```js
// packages/core/src/otlpExporter/common/semconv/base/mappings.js
log: {
  BODY: 'log.body',          // ← non-standard, spec uses 'body' as a top-level field
  SEVERITY: 'log.severity',  // ← non-standard
  FUNCTION: 'code.function'
}
```

> ⚠️ **Discrepancy**: `log.body` and `log.severity` are **not** OTel OTLP LogRecord attribute keys — they are top-level `LogRecord` proto fields (`body`, `severityNumber`/`severityText`). The `base/mappings.js` entries likely pre-date the log implementation. The logs converter should **not** use these as attribute keys; it should emit them as proper LogRecord top-level fields.

`code.function` in base mappings is correct as a span attribute key from OTel [code semconv](https://opentelemetry.io/docs/specs/semconv/general/attributes/#source-code-attributes).

---

## 6. Proposed File Structure

```
packages/core/src/otlpExporter/
├── index.js                         ← add logs.init(config); logs export
├── common/                          ← shared (unchanged)
│   └── transformers/resource.js     ← reused for resourceLogs resource extraction
├── traces/                          ← unchanged
├── metrics/                         ← unchanged
└── logs/                            ← NEW
    ├── index.js                     ← { init, convert }
    ├── converter.js                 ← main convert(spans) → { resourceLogs }
    └── transformers/
        ├── index.js
        └── logRecord.js             ← extractLogRecord(span) → LogRecord object
```

---

## 7. Implementation Plan (Phased)

### Phase 1 — Core log record conversion (MVP)

1. **Create `logs/converter.js`**
   - Accept `spans` array (same input as traces converter)
   - Filter to log spans via `isLogSpan(span)` from `traces/util.js` (move to `common/util.js` or re-import)
   - For each log span, call `transformers.logRecord.extractLogRecord(span)`
   - Build and return `{ resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords }] }] }`

2. **Create `logs/transformers/logRecord.js`**
   - Map all fields per §4.1 table
   - Severity mapping per §4.2 table (hard-coded constant map, no semconv versioning needed — these are top-level fields not attributes)
   - `traceId` / `spanId` padded the same way as `spanMetaData.js`

3. **Update `index.js`**
   - `require('./logs')` and call `logs.init(config)` in `init()`
   - Export `logs`

4. **Update `traces/converter.js`**
   - Remove the `continue` skip; instead collect log spans separately and pass to `logs.converter.convert()`
   - Or: keep logs converter fully independent (called from outside), just remove the `continue` and let caller handle routing

### Phase 2 — Optional attributes

5. **`code.*` attributes** from `span.stack` (if non-empty)
6. **`log.iostream`** for `log.console` spans
7. **`log.record.uid`** — could be `span.s` (span ID) since it is unique

---

## 8. Unchanged / Out of Scope

- Semconv versioning (v1.23 vs v1.41): log record top-level fields (`body`, `severityNumber`) are not semconv-versioned attributes — they are proto fields. Only `code.*` attributes (if added) are stable across versions and need no versioning.
- `span.data.log.message` truncation: already handled upstream by each logger instrumentation (e.g., bunyan truncates to 500 chars).
- Transport/endpoint routing (HTTP `/v1/logs` vs `/v1/traces`): outside scope of this converter module.
- `traceFlags` from W3C `traceparent`: not available in Instana span model — default to `1` (sampled).

---

## 9. Reference Links

- [OTel Logs Data Model spec](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
- [OTel Semantic Conventions — Logs](https://opentelemetry.io/docs/specs/semconv/general/logs/)
- [OTel Concepts — Logs signal](https://opentelemetry.io/docs/concepts/signals/logs/)
- [OTel proto: logs/v1/logs.proto](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/logs/v1/logs.proto)
- [OTel semconv — Source code attributes](https://opentelemetry.io/docs/specs/semconv/general/attributes/#source-code-attributes)
- Instana logging instrumentations: [`logging/pino.js`](../tracing/instrumentation/logging/pino.js), [`logging/winston.js`](../tracing/instrumentation/logging/winston.js), [`logging/bunyan.js`](../tracing/instrumentation/logging/bunyan.js), [`logging/log4js.js`](../tracing/instrumentation/logging/log4js.js), [`logging/console.js`](../tracing/instrumentation/logging/console.js)
- Instana log level constants: [`util/constants.js`](../util/constants.js)
- Log span detection: [`otlpExporter/traces/util.js`](./traces/util.js)
