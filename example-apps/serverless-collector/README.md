# Serverless Collector Example app

This is a trivial Node.js application suitable for quick experiments with the @instana/serverless-collector. 

## Run

```sh
npm i
INSTANA_ENDPOINT_URL=... INSTANA_AGENT_KEY=... npm start

# By default we are using the released pkg on NPM.
MODE=local INSTANA_ENDPOINT_URL=... INSTANA_AGENT_KEY=... npm start

APP_PORT=9192 INSTANA_ENDPOINT_URL=... INSTANA_AGENT_KEY=... npm start
```

## Triggering Requests

1. Make sure you have [siege](https://www.joedog.org/siege-home/) installed. On most OSes it can be installed via the package manager of your choice.
2. Run `./trigger-requests.sh`.

