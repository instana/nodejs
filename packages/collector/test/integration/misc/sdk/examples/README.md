SDK Examples
============

This directory contains a couple of small test applications that use the Instana Node.js tracing SDK.

They all create an entry span in regular intervals via the SDK. They do not need to be triggered by an external request.

Available Examples
---------------------

There are currently six different examples, two for each SDK API style: `async`, `promise`, and `callback`.

One of each pair is using a *recursive* call pattern. That is, the next call is triggered from the context of the previous call. The call is triggerd via `setTimeout` but that does not matter with respect to AsyncLocalStorage (ALS for short)/cls-hooked, because the context is kept across `setTimeout` (or any async mechanism – this is precisely the point of ALS/cls-hooked). Note: This particular usage pattern used to create memory issues up until version `@instana/collector@2.11.0`, which lead to increased CPU usage. This has been fixed with version `2.11.1`

The other type of example apps schedule calls regularly via `setInterval`. The crucial difference is that calls are not triggered from the context of the preceding call, but from the root context.

Usage
-----
The SDK will only actually create spans when `@instana/collector` has established a connection to an agent. To run the examples, you therefore need to start an agent locally.

If you are not interested in inspecting the reported data in Instana, you can start
```
DROP_DATA=true node packages/collector/test/apps/agentStub
```

in a separate shell. Otherwise, start an Instana agent locally. Be aware that the examples will create a lot of spans very quickly, though. (This can be controlled with the `DELAY` environment variable, see below.`)

Start an example app like this:

```
node packages/collector/test/integration/misc/sdk/examples/async_recursive.js
```

There are a couple of options to control the behavior:

```
# Set a custom delay in milliseconds between individual calls. The default is currently 10 (!) milliseconds.
DELAY=1000 node packages/collector/test/integration/misc/sdk/examples/async_recursive.js

# Force @instana/collector to use the legacy cls-hooked library instead of AsyncLocalStorage.
INSTANA_FORCE_LEGACY_CLS=true node packages/collector/test/integration/misc/sdk/examples/async_recursive.js
```

### Creating a Heapdump

* Run `npm i -g heapdump && npm link heapdump`.
* Uncomment the line `// const heapdump = require('heapdump');` in the example app you want to run.
* Start the app and check its pid.
* Execute `kill -USR2 $pid` to create a heapdump while the process is running. Heapdumps can be inspected via Chrome/Chromium for example (DevTools -> tab memory -> Load).
