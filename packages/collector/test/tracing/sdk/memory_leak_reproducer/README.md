SDK Memory Leak Reproducer
==========================

This directory contains a couple of small test applications that try to reproduce a memory leak in the SDK, or rather, in our use of AsyncLocalStorage/cls-hooked.

They all create an entry span in regular intervals via the SDK. They do not need to be triggered by an external request.

Available Reproducers
---------------------

There are currently six different reproducers, two for each SDK API style:
* async,
* promise, and
* callback.

One of each pair is using a *recursive* call pattern. That is, the next call is triggered from the context of the previous call. The call is triggerd via `setTimeout` but that does not matter with respect to AsyncLocalStorage (ALS for short)/cls-hooked, because the context is kept across `setTimeout` (or any async mechanism – this is precisely the point of ALS/cls-hooked).

The other reproducer is scheduling regular calls via `setInterval`. The crucial difference is that calls are not triggered from the context of the preceding call, but from the root context.

The current hypothesis is that all recursive reproducers are affected by the leak, no matter which API style the use or whether they use ALS or the legacy cls-hooked implementation. Additionally, some of the non-recursive reproducers might also be affected due to the failure of existing the context after Namespace#runPromise.

Usage
-----
The SDK will only actually create spans when @instana/collector has established a connection to an agent. To run the examples, you therefore need to start an agent locally.

If you are not interested in inspecting the reported data in Instana, you can start
```
DROP_DATA=true node packages/collector/test/apps/agentStub
```

in a separate shell. Otherwise, start an Instana agent locally. Be aware that the reproducers will create a lot of spans, though.

Start a reproducer like this:

node packages/collector/test/tracing/sdk/memory_leak_reproducer/async_recursive.js

There are a couple of options to control the behavior:

```
# Set a custom delay in milliseconds between individual calls. The default is currently 10 (!) milliseconds.
DELAY=1000 node packages/collector/test/tracing/sdk/memory_leak_reproducer/async_recursive.js

# Force @instana/collector to use the legacy cls-hooked library instead of AsyncLocalStorage.
INSTANA_FORCE_LEGACY_CLS=true node packages/collector/test/tracing/sdk/memory_leak_reproducer/async_recursive.js

# Print additional debug output
DEBUG_CLS=true node packages/collector/test/tracing/sdk/memory_leak_reproducer/async_recursive.js
```

### Creating a Heapdump

All reproducers load the `heapdump` module. Execute `kill -USR2 $pid` to create a heapdump while the process is running. Heapdumps can be inspected via Chrome/Chromium for example (DevTools -> tab memory -> Load).

Analysis
--------

The detailed analysis is currently not available in publicly. The internal link is: https://www.notion.so/instana/SDK-Memory-Leak-a807a1b242c84976ac79d9a1a9037494
