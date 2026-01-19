# OpenTelemetry Instrumentation Customization Guide

This guide explains how to customize OpenTelemetry instrumentations in the Instana Node.js collector.

## Architecture Overview

The OTel instrumentation system in `packages/core/src/tracing/opentelemetry-instrumentations/` provides multiple extension points:

1. **Instrumentation Hooks** - Configure OTel instrumentations with custom hooks
2. **SpanProcessor** - Process spans after they're created
3. **changeTags()** - Transform OTel attributes to Instana format
4. **getKind()** - Override span kind (ENTRY/EXIT/INTERMEDIATE)
5. **extractW3CTraceContext()** - Extract trace context for ENTRY spans
6. **setW3CTraceContext()** - Inject trace context for EXIT spans

## Example: Capturing Bind Variables from OracleDB

### Approach 1: Using Instrumentation Hooks (Recommended)

File: `packages/core/src/tracing/opentelemetry-instrumentations/oracle.js`

```javascript
module.exports.init = () => {
  const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');

  const instrumentation = new OracleInstrumentation({
    // Capture bind variables at query execution time
    requestHook: (span, request) => {
      if (request.bindParams) {
        span.setAttribute('db.bind_variables', JSON.stringify(request.bindParams));
      }
    },
    
    // Capture response metadata
    responseHook: (span, response) => {
      if (response?.rowsAffected !== undefined) {
        span.setAttribute('db.rows_affected', response.rowsAffected);
      }
    }
  });

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

// Transform attributes for Instana backend
module.exports.changeTags = (otelSpan, tags) => {
  if (tags['db.bind_variables']) {
    const bindVars = JSON.parse(tags['db.bind_variables']);
    tags['db.statement_with_values'] = injectBindVariables(tags['db.statement'], bindVars);
  }
  return tags;
};
```

**Pros:**
- ✅ Direct access to request/response objects
- ✅ Captures data at source
- ✅ Lower overhead (only processes relevant spans)
- ✅ Integrates with existing `changeTags()` hook

### Approach 2: Using SpanProcessor

File: `packages/core/src/tracing/opentelemetry-instrumentations/OracleSpanProcessor.js`

```javascript
const { SpanProcessor } = require('@opentelemetry/sdk-trace-base');

class OracleSpanProcessor extends SpanProcessor {
  onEnd(span) {
    const instrumentationScope = span.instrumentationScope || span.instrumentationLibrary;
    
    if (instrumentationScope?.name === '@opentelemetry/instrumentation-oracledb') {
      // Process Oracle spans
      const attributes = span.attributes;
      if (attributes['db.bind_variables']) {
        // Enrich span with formatted bind variables
        span.setAttribute('db.bind_variables_formatted', formatBindVars(attributes));
      }
    }
  }
}
```

Register in `wrap.js`:
```javascript
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new OracleSpanProcessor());
```

**Pros:**
- ✅ Works with any instrumentation
- ✅ Centralized processing logic
- ✅ Can modify all spans uniformly

**Cons:**
- ❌ Only sees span attributes (not original request/response)
- ❌ Runs for every span (higher overhead)

## Adding a New Instrumentation

### Step 1: Create instrumentation file

Create `packages/core/src/tracing/opentelemetry-instrumentations/my-db.js`:

```javascript
'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const { MyDBInstrumentation } = require('@opentelemetry/instrumentation-mydb');
  
  const instrumentation = new MyDBInstrumentation({
    requestHook: (span, request) => {
      // Capture custom data
      span.setAttribute('db.custom_field', request.customData);
    }
  });
  
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => constants.EXIT;

module.exports.changeTags = (otelSpan, tags) => {
  // Transform tags for Instana
  return tags;
};
```

### Step 2: Register in wrap.js

Add to the `instrumentations` object in `wrap.js`:

```javascript
const instrumentations = {
  // ... existing
  '@opentelemetry/instrumentation-mydb': { name: 'my-db' }
};
```

## Extension Points Reference

### 1. init({ cls, api })
Initialize the OTel instrumentation with configuration.

```javascript
module.exports.init = ({ cls, api }) => {
  const instrumentation = new MyInstrumentation({
    // OTel configuration
  });
  instrumentation.enable();
};
```

### 2. getKind(otelSpan)
Override the span kind (ENTRY/EXIT/INTERMEDIATE).

```javascript
module.exports.getKind = (otelSpan) => {
  if (otelSpan.attributes['operation.type'] === 'receive') {
    return constants.ENTRY;
  }
  return constants.EXIT;
};
```

### 3. changeTags(otelSpan, tags)
Transform OTel attributes to Instana format.

```javascript
module.exports.changeTags = (otelSpan, tags) => {
  // Add custom fields
  tags['custom.field'] = 'value';
  
  // Transform existing fields
  if (tags['db.statement']) {
    tags['db.statement_formatted'] = formatSQL(tags['db.statement']);
  }
  
  return tags;
};
```

### 4. extractW3CTraceContext(preparedData, otelSpan)
Extract W3C trace context for ENTRY spans (for trace correlation).

```javascript
module.exports.extractW3CTraceContext = (preparedData, otelSpan) => {
  if (preparedData.kind !== constants.ENTRY) {
    return { traceId: null, parentSpanId: null };
  }
  
  const spanContext = otelSpan.parentSpanContext;
  return {
    traceId: spanContext?.traceId?.substring(16),
    parentSpanId: spanContext?.spanId
  };
};
```

### 5. setW3CTraceContext(api, preparedData, otelSpan, instanaSpan, originalCtx)
Inject W3C trace context for EXIT spans (for trace propagation).

```javascript
module.exports.setW3CTraceContext = (api, preparedData, otelSpan, instanaSpan, originalCtx) => {
  if (preparedData.kind !== constants.EXIT) return originalCtx;
  
  const w3cTraceContext = W3cTraceContext.fromInstanaIds(
    instanaSpan.t,
    instanaSpan.s,
    !preparedData.isSuppressed
  );
  
  const carrier = {};
  carrier['traceparent'] = w3cTraceContext.renderTraceParent();
  return api.propagation.extract(originalCtx, carrier);
};
```

## Best Practices

1. **Use Instrumentation Hooks First** - They provide direct access to request/response objects
2. **Use changeTags() for Formatting** - Transform data for Instana backend display
3. **Use SpanProcessor for Cross-Cutting Concerns** - When you need to process all spans uniformly
4. **Keep Processing Lightweight** - Avoid heavy computations in hooks
5. **Handle Errors Gracefully** - Wrap transformations in try-catch to prevent span loss
6. **Document Custom Attributes** - Add comments explaining custom fields

## Testing

Test your customizations by:

1. Creating a test app that uses the instrumented library
2. Verifying spans contain expected attributes
3. Checking Instana backend displays data correctly
4. Testing with suppressed traces
5. Testing trace correlation (ENTRY/EXIT pairs)

## Examples in Codebase

- **fs.js** - Custom parent span checking
- **socket.io.js** - Event name formatting
- **confluent-kafka.js** - W3C trace context handling
- **restify.js** - Span kind override
- **oracle.js** - Bind variables capture (NEW)