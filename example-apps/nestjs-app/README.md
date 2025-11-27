# Instana Nest.js Example

A simple Nest.js app integrated with Instana.

## Setup

ESM loader is configured in `package.json`:

```json
"start": "NODE_OPTIONS='--import ./node_modules/@instana/collector/esm-register.mjs' nest start"
```

## Project setup

```bash
$ npm i -g @nestjs/cli
$ npm install
```

## Run the project

```bash
$ npm run start
```

## Run application:

```
http://localhost:3000/
http://localhost:3000/instana
```

## References

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
