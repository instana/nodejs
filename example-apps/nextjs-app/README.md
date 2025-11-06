# Instana Next.js Example

A simple Next.js app integrated with Instana for automatic tracing and monitoring.

## Setup

Instana’s ESM loader is configured in `package.json`:

```json
"start": "NODE_OPTIONS='--import ./node_modules/@instana/collector/esm-register.mjs' INSTANA_DEBUG=true next start"
```

## Run the App

### Development

```bash
npm i
npm run build
npm run start
```

App runs at `http://localhost:3000`.


## Routes

* **Home:** `/` – Basic landing page
* **API:** `/api/hello` – Returns `{ "message": "Hello from Instana-monitored Next.js API!" }`
