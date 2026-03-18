/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const tracingUtil = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', () => {
  describe('maskBindVariables', () => {
    it('should preserve exact length and show first 2 and last 2 chars for long values', () => {
      const params = ['testuser', 'password123', 'email@example.com'];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(3);
      // 'testuser' (8 chars) -> 'te****er'
      expect(masked[0]).to.equal('te****er');
      expect(masked[0]).to.have.lengthOf(8);
      // 'password123' (11 chars) -> 'pa*******23'
      expect(masked[1]).to.equal('pa*******23');
      expect(masked[1]).to.have.lengthOf(11);
      // 'email@example.com' (17 chars) -> 'em***********om'
      expect(masked[2]).to.equal('em***********om');
      expect(masked[2]).to.have.lengthOf(17);
    });

    it('should show first and last char for length 4-5', () => {
      const params = ['test', 'hello'];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(2);
      // 'test' (4 chars) -> 't**t'
      expect(masked[0]).to.equal('t**t');
      expect(masked[0]).to.have.lengthOf(4);
      // 'hello' (5 chars) -> 'h***o'
      expect(masked[1]).to.equal('h***o');
      expect(masked[1]).to.have.lengthOf(5);
    });

    it('should mask short strings completely preserving length', () => {
      const params = ['ab', 'xyz', 'a'];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(3);
      expect(masked[0]).to.equal('**');
      expect(masked[0]).to.have.lengthOf(2);
      expect(masked[1]).to.equal('***');
      expect(masked[1]).to.have.lengthOf(3);
      expect(masked[2]).to.equal('*');
      expect(masked[2]).to.have.lengthOf(1);
    });

    it('should handle null and undefined values', () => {
      const params = [null, undefined, 'value'];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(3);
      expect(masked[0]).to.equal('<null>');
      expect(masked[1]).to.equal('<undefined>');
      // 'value' (5 chars) -> 'v***e'
      expect(masked[2]).to.equal('v***e');
      expect(masked[2]).to.have.lengthOf(5);
    });

    it('should convert numbers to strings and mask them', () => {
      const params = [12345, 42, 999999999, 3.14159, -100];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(5);
      // '12345' (5 chars) -> '1***5'
      expect(masked[0]).to.equal('1***5');
      expect(masked[0]).to.have.lengthOf(5);
      // '42' (2 chars) -> '**'
      expect(masked[1]).to.equal('**');
      expect(masked[1]).to.have.lengthOf(2);
      // '999999999' (9 chars) -> '99*****99'
      expect(masked[2]).to.equal('99*****99');
      expect(masked[2]).to.have.lengthOf(9);
      // '3.14159' (7 chars) -> '3.***59'
      expect(masked[3]).to.equal('3.***59');
      expect(masked[3]).to.have.lengthOf(7);
      // '-100' (4 chars) -> '-**0'
      expect(masked[4]).to.equal('-**0');
      expect(masked[4]).to.have.lengthOf(4);
    });

    it('should handle boolean values', () => {
      const params = [true, false];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(2);
      // 'true' (4 chars) -> 't**e'
      expect(masked[0]).to.equal('t**e');
      expect(masked[0]).to.have.lengthOf(4);
      // 'false' (5 chars) -> 'f***e'
      expect(masked[1]).to.equal('f***e');
      expect(masked[1]).to.have.lengthOf(5);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const params = [date];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      // ISO string is masked: '2024-01-15T10:30:00.000Z' (24 chars) -> '20******************00Z'
      expect(masked[0]).to.match(/^20\*+0Z$/);
      expect(masked[0]).to.have.lengthOf(24);
    });

    it('should handle JSON objects', () => {
      const params = [
        { name: 'John', age: 30 },
        { email: 'test@example.com', active: true }
      ];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(2);

      // Parse to verify it's valid JSON and check structure
      const parsed1 = JSON.parse(masked[0]);
      expect(parsed1).to.have.property('n**e', 'J**n');
      expect(parsed1).to.have.property('a*e', '30');

      const parsed2 = JSON.parse(masked[1]);
      expect(parsed2).to.have.property('em**l', 'te**************om');
      expect(parsed2).to.have.property('ac***e', 't**e');
    });

    it('should handle arrays', () => {
      const params = [
        [1, 2, 3],
        ['a', 'b', 'c'],
        [{ id: 1 }, { id: 2 }]
      ];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(3);

      // Parse to verify it's valid JSON and check structure
      const parsed1 = JSON.parse(masked[0]);
      expect(parsed1).to.be.an('array');
      expect(parsed1).to.have.lengthOf(3);
      expect(parsed1[0]).to.equal('1');
      expect(parsed1[1]).to.equal('2');
      expect(parsed1[2]).to.equal('3');

      const parsed2 = JSON.parse(masked[1]);
      expect(parsed2).to.be.an('array');
      expect(parsed2).to.have.lengthOf(3);
      expect(parsed2[0]).to.equal('*');
      expect(parsed2[1]).to.equal('*');
      expect(parsed2[2]).to.equal('*');

      const parsed3 = JSON.parse(masked[2]);
      expect(parsed3).to.be.an('array');
      expect(parsed3).to.have.lengthOf(2);
      expect(parsed3[0]).to.have.property('*d', '1');
      expect(parsed3[1]).to.have.property('*d', '2');
    });

    it('should handle Buffer (binary data)', () => {
      const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG header
      const params = [imageBuffer];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      expect(masked[0]).to.equal('<Buffer 4 bytes>');
    });

    it('should handle large Buffer', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      const params = [largeBuffer];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      expect(masked[0]).to.equal('<Buffer 1048576 bytes>');
    });

    it('should handle circular references in objects', () => {
      const obj = { name: 'test' };
      obj.self = obj; // Create circular reference
      const params = [obj];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      expect(masked[0]).to.equal('<Object [circular]>');
    });

    it('should handle circular references in arrays', () => {
      const arr = [1, 2, 3];
      arr.push(arr); // Create circular reference
      const params = [arr];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      expect(masked[0]).to.equal('<Array [circular]>');
    });

    it('should handle BigInt values', () => {
      // eslint-disable-next-line no-undef
      const params = [BigInt(9007199254740991), BigInt(123)];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(2);
      // '9007199254740991' (16 chars) -> '90************91'
      expect(masked[0]).to.equal('90************91');
      expect(masked[0]).to.have.lengthOf(16);
      // '123' (3 chars) -> '***'
      expect(masked[1]).to.equal('***');
      expect(masked[1]).to.have.lengthOf(3);
    });

    it('should handle empty array', () => {
      const params = [];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(0);
    });

    it('should return non-array input as-is', () => {
      const notAnArray = 'not an array';
      const result = tracingUtil.maskBindVariables(notAnArray);

      expect(result).to.equal(notAnArray);
    });

    it('should preserve exact length for very long values', () => {
      const longValue = 'a'.repeat(100);
      const params = [longValue];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(1);
      // First 2 chars + 96 asterisks + last 2 chars = 100 chars
      expect(masked[0]).to.have.lengthOf(100);
      expect(masked[0]).to.match(/^aa\*{96}aa$/);
    });

    it('should handle mixed data types', () => {
      const params = [
        'string',
        123,
        true,
        null,
        undefined,
        { key: 'value' },
        [1, 2, 3],
        new Date('2024-01-01'),
        Buffer.from('test')
      ];
      const masked = tracingUtil.maskBindVariables(params);

      expect(masked).to.be.an('array');
      expect(masked).to.have.lengthOf(9);
      expect(masked[0]).to.equal('st**ng'); // string
      expect(masked[1]).to.equal('***'); // 123
      expect(masked[2]).to.equal('t**e'); // true
      expect(masked[3]).to.equal('<null>');
      expect(masked[4]).to.equal('<undefined>');
      expect(masked[5]).to.match(/^\{"\*+e\}$/); // JSON object
      expect(masked[6]).to.equal('[1***3]'); // array
      expect(masked[7]).to.match(/^20\*+0Z$/); // Date
      expect(masked[8]).to.equal('<Buffer 4 bytes>'); // Buffer
    });
  });
});

// Made with Bob
