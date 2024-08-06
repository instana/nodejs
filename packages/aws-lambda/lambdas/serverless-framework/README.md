# Serverless

## Prerequisite

Navigate into one of the three serverless services and run:

    npm i

## Execute

Build

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key pnpm run build

Build & Deploy

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key pnpm run deploy

Deploy

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key pnpm run deploy:nobuild

Invoke Lambda Function (serverless-offline only)

    pnpm run invoke

**Note**: `serverless-offline` only works with Node v14, see https://github.com/lambci/docker-lambda/issues/329.