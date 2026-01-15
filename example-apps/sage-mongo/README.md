# MongoDB Connection Module & API

## Overview

This project demonstrates a **MongoDB connection utility** with a **simple HTTP API** using Node.js and Express.


## Installation:

```bash
npm install
```

## Start the API server

```bash
npm start
```

* API will listen on: `http://localhost:3000`


## API Endpoints

**GET /users** – fetch all users

```bash
curl http://localhost:3000/users
```

**POST /users** – insert a new user

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@test.com"}'
```

## Notes

* `.es5` extension is **historical**, indicating the file was intended for ES5-compatible environments.
* Node.js ignores the extension — the code runs as long as syntax is valid.
* Built-in modules (`crypto`, `os`, `path`, `querystring`) do **not require installation**.
* `fsHelper` is optional for standalone testing; otherwise it comes from your internal library.

