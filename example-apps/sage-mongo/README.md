# MongoDB Connection Module & API

## Overview

This project demonstrates a **MongoDB connection utility** with a **simple HTTP API** using Node.js and Express.


## Installation:

```bash
npm install
```

## Start mongo

```
node bin/start-test-containers.js --mongodb
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


