#!/usr/bin/env node
/* [object Object]
[object Object]
[object Object]
[object Object] */

'use strict';

/**
 * Compile JavaScript files to V8 bytecode (.jsc) using bytenode
 */

const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

function compileToJSC(inputFile, outputFile) {
  console.log(`Compiling ${inputFile} to ${outputFile}...`);

  try {
    const inputPath = path.join(__dirname, inputFile);
    const outputPath = path.join(__dirname, outputFile);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Compile the file to bytecode
    bytenode.compileFile({
      filename: inputPath,
      output: outputPath
    });

    const stats = fs.statSync(outputPath);
    console.log(`✓ Successfully compiled ${inputFile}`);
    console.log(`  Bytecode size: ${stats.size} bytes`);

    return true;
  } catch (error) {
    console.error(`✗ Error compiling ${inputFile}:`, error.message);
    return false;
  }
}

console.log('Starting V8 bytecode compilation with bytenode...\n');

// Compile the combined file
const success = compileToJSC('../sage-mongo/index-combined.es5', 'index.jsc');

console.log(`\n${success ? '✓ Compilation completed successfully!' : '✗ Compilation failed'}`);
process.exit(success ? 0 : 1);

// Made with Bob
