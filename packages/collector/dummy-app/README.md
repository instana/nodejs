# Dummy App

This is a trivial Node.js application suitable for quick experiments with the @instana/collector. By default, it will
connect to a local agent on port 42699.

## Configuring And Starting The App

The app can be started via `node .` or `npm start`.

It is configured via environment variables. The default values for the environment variables are in the `.env` file.
The defaults can be overwritten like this `AGENT_PORT=3210 node .`.

## Using The Agent Stub

If you want to use the agent stub instead of an actual agent, do this:

```
# start the agent stub
cd nodejs/packages/collector
DROP_DATA=true pnpm run agent-stub

# start the app (in a separate terminal)
cd nodejs/packages/collector/dummy-app
INSTANA_AGENT_PORT=3210 node .
```

## Triggering Requests

1. Make sure you have [siege](https://www.joedog.org/siege-home/) installed. On most OSes it can be installed via the package manager of your choice.
2. Run `./trigger-requests.sh`.

