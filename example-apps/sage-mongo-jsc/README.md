# MongoDB Connection Module & API (V8 Bytecode with Bytenode)

## Overview

This project demonstrates a **MongoDB connection utility** with a **simple HTTP API** using Node.js and Express. This version compiles JavaScript files to **V8 bytecode (.jsc files)** using the **bytenode** package for improved startup performance and code protection.

## What is Bytenode?

[Bytenode](https://github.com/bytenode/bytenode) is a minimalist bytecode compiler for Node.js that compiles JavaScript code into V8 bytecode. This provides:

- **Faster startup times** - Skip parsing and compilation phases
- **Code protection** - Source code is not directly readable
- **Easy integration** - Simple API and automatic require() patching
- **Production ready** - Used in real-world applications

## Files

- `compile.js` - Compilation script using bytenode to convert the combined .es5 file to .jsc bytecode
- `index.jsc` - Compiled bytecode containing the entire application (generated, directly executable)
- `package.json` - Project dependencies and scripts

**Source file:**
- `../sage-mongo/index-combined.es5` - Combined source file with MongoDB connection logic and Express app

## Installation

```bash
npm install
```

The `postinstall` script will automatically compile the source files to bytecode after installation.

## Manual Compilation

To manually compile source files to V8 bytecode:

```bash
npm run compile
```

This will:
1. Read `../sage-mongo/index-combined.es5` (contains both MongoDB connection logic and Express app)
2. Compile it to V8 bytecode using bytenode
3. Generate a single `index.jsc` file

## Start MongoDB

```bash
node ../../bin/start-test-containers.js --mongodb
```

## Start the API Server

Run with Instana monitoring:
```bash
npm start
```

Or run bytecode only (without Instana):
```bash
npm run start:bytecode
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

## How It Works

### Compilation Phase (`compile.js`)

```javascript
const bytenode = require('bytenode');

bytenode.compileFile({
  filename: 'input.js',
  output: 'output.jsc'
});
```

Bytenode reads the JavaScript source and compiles it to V8 bytecode, saving it as a `.jsc` file.

### Execution Phase

The .jsc files are executed directly using Node.js with bytenode preloaded:

```bash
node -r bytenode index.jsc
```

The `-r bytenode` flag preloads the bytenode module, which patches Node.js's `require()` function to automatically handle `.jsc` files. When you run or require a `.jsc` file, bytenode:
1. Loads the bytecode
2. Creates a V8 script from the bytecode
3. Executes it in the current context
4. Handles any `require()` calls for other `.jsc` files automatically

## Benefits

- **Performance**: Bytecode execution skips the parsing and compilation steps
- **Security**: Source code is compiled to bytecode, making reverse engineering harder
- **Simplicity**: Bytenode handles all the complexity - just require `.jsc` files like normal modules
- **Compatibility**: Works with all Node.js features including require(), module.exports, etc.

## Notes

- Bytecode is **version-specific** - recompile when upgrading Node.js major versions
- Source files are needed during compilation but not during execution
- Bytecode provides obfuscation but is not encryption
- The `.jsc` files are excluded from git via `.gitignore`

## Troubleshooting

**Error: "Cannot find module './index.jsc'"**
- Run `npm run compile` to generate the bytecode files

**Bytecode not working after Node.js upgrade**
- Recompile the bytecode: `npm run compile`
- Bytecode is tied to the V8 version in Node.js

**Module loading issues**
- Ensure bytenode is required before loading .jsc files
- Check that all dependencies are properly installed

## References

- [Bytenode GitHub](https://github.com/bytenode/bytenode)
- [V8 Bytecode Documentation](https://v8.dev/docs)