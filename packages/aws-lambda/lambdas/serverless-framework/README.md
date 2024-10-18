# Serverless

## Prerequisite

Navigate into one of the three serverless services and run:

    npm i

## Execute

Build

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key npm run build

Build & Deploy

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key npm run deploy

Deploy

    INSTANA_ENDPOINT_URL=url INSTANA_AGENT_KEY=key npm run deploy:nobuild

Invoke Lambda Function (serverless-offline only)

    npm run invoke
