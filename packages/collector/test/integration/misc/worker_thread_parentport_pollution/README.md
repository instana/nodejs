# Worker Thread ParentPort Pollution Test

## Overview

This integration test verifies and demonstrates a critical issue where Instana's Node.js tracer sends unsolicited messages through `parentPort.postMessage()` in worker threads, polluting the application's message channel and causing data corruption.

## The Issue

When Instana is initialized in a worker thread (either via `NODE_OPTIONS` pre-require or explicit require), it sends an internal lifecycle message:

```javascript
parentPort.postMessage('instana.collector.initialized');
```

This message is injected into the same communication channel that the application uses for its own worker-to-main-thread communication, causing:

1. **Message Contract Violations**: Applications expecting structured messages receive unexpected string messages
2. **Data Corruption**: Message handlers may fail when processing unexpected message types
3. **Runtime Errors**: Code like `message.fileName` becomes `undefined` when the message is a string
4. **Downstream Failures**: Corrupted data propagates to file systems, databases, or message queues

## Root Cause

Located in `packages/collector/src/announceCycle/agentready.js` (lines 156-163):

```javascript
if (!isMainThread) {
  const { parentPort } = require('worker_threads');

  if (parentPort) {
    // CASE: This is for the worker thread if available.
    parentPort.postMessage('instana.collector.initialized');
  }
}
```

## Test Structure

### Files

- **`worker.js`**: Simulates a PDF generation worker that sends structured data to the main thread
- **`app.js`**: Main application that spawns the worker and tracks all received messages
- **`test_base.js`**: Integration tests that verify the pollution behavior
- **`test.js`**: Test runner
- **`package.json`**: Dependencies

### Test Scenarios

#### 1. Without Pollution (Baseline)
When Instana is only in the main thread (not pre-required), worker threads operate normally:
- ✅ No `instana.collector.initialized` messages
- ✅ Only application messages are received
- ✅ Message contracts are respected

#### 2. With Pollution (Bug Demonstration)
When Instana is pre-required via `NODE_OPTIONS`, it affects worker threads:
- ❌ `instana.collector.initialized` appears in the message stream
- ❌ Application receives unexpected string messages
- ❌ Message contracts are violated

#### 3. Message Order Corruption
Demonstrates how the pollution message appears mixed with application messages:
```javascript
// Expected:
[
  { type: 'worker-ready' },
  { fileName: 'test.pdf', content: Buffer }
]

// Actual with Instana:
[
  'instana.collector.initialized',  // ← Pollution
  { type: 'worker-ready' },
  { fileName: 'test.pdf', content: Buffer }
]
```

#### 4. Real-World Impact
Simulates the PDF generation use case from the issue report:
- Worker generates PDF: `{ fileName: 'report.pdf', content: Buffer }`
- Instana injects: `'instana.collector.initialized'`
- Application code expecting objects receives strings
- Results in: `reporte.fileName` → `undefined` → `path.join()` errors

## Running the Tests

```bash
# Run this specific test
npm test -- packages/collector/test/integration/misc/worker_thread_parentport_pollution/test.js

# Run with verbose output
npm test -- packages/collector/test/integration/misc/worker_thread_parentport_pollution/test.js --grep "parentPort"
```

## Expected Test Results

The tests are designed to **demonstrate and verify the bug exists**:

- ✅ Tests with in-app require (main thread only) should pass - no pollution
- ✅ Tests with `NODE_OPTIONS` pre-require should pass - **but they verify pollution exists**
- ✅ All assertions confirm the problematic behavior

## Use Case: PDF Generation

This test simulates a real-world scenario where:

1. Main thread receives HTTP request for PDF generation
2. Main thread spawns worker thread with generation parameters
3. Worker thread generates PDF and sends back: `{ fileName: string, content: Buffer }`
4. Main thread expects to receive only this structured message
5. **But Instana injects `'instana.collector.initialized'` into the same channel**
6. Main thread's message handler fails when it receives a string instead of an object

## Proposed Solutions

1. **Don't use parentPort for internal messages**: Use a different mechanism for lifecycle events
2. **Namespace the messages**: Use a structured format like `{ __instana: true, type: 'initialized' }`
3. **Make it optional**: Provide a config option to disable worker thread lifecycle messages
4. **Use a separate channel**: Create a dedicated communication channel for Instana internals

## Related Code

- Issue root cause: `packages/collector/src/announceCycle/agentready.js:161`
- Similar pattern for IPC: `packages/collector/src/announceCycle/agentready.js:154`
- Worker thread metrics: `packages/collector/test/integration/metrics/worker_thread/`

## Impact

- **Severity**: High - Causes data corruption and runtime errors
- **Scope**: Any application using worker threads with Instana pre-require
- **Workaround**: Avoid `NODE_OPTIONS` pre-require, use in-app require only in main thread
- **Affected Use Cases**: PDF generation, image processing, data transformation, any worker-based processing