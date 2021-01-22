/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const expect = require('chai').expect;
const leftPad = require('../../src/tracing/leftPad');

describe('tracing/leftPad', () => {
  it('must left-pad to 16', () => {
    expect(leftPad('', 16)).to.equal('0000000000000000');
    expect(leftPad('a', 16)).to.equal('000000000000000a');
    expect(leftPad('aa', 16)).to.equal('00000000000000aa');
    expect(leftPad('aaa', 16)).to.equal('0000000000000aaa');
    expect(leftPad('aaaa', 16)).to.equal('000000000000aaaa');
    expect(leftPad('aaaaa', 16)).to.equal('00000000000aaaaa');
    expect(leftPad('aaaaaa', 16)).to.equal('0000000000aaaaaa');
    expect(leftPad('aaaaaaa', 16)).to.equal('000000000aaaaaaa');
    expect(leftPad('aaaaaaaa', 16)).to.equal('00000000aaaaaaaa');
    expect(leftPad('aaaaaaaaa', 16)).to.equal('0000000aaaaaaaaa');
    expect(leftPad('aaaaaaaaaa', 16)).to.equal('000000aaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaa', 16)).to.equal('00000aaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaa', 16)).to.equal('0000aaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaa', 16)).to.equal('000aaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaa', 16)).to.equal('00aaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaa', 16)).to.equal('0aaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaa', 16)).to.equal('aaaaaaaaaaaaaaaa');
  });

  it('must left-pad to 32', () => {
    expect(leftPad('', 32)).to.equal('00000000000000000000000000000000');
    expect(leftPad('a', 32)).to.equal('0000000000000000000000000000000a');
    expect(leftPad('aa', 32)).to.equal('000000000000000000000000000000aa');
    expect(leftPad('aaa', 32)).to.equal('00000000000000000000000000000aaa');
    expect(leftPad('aaaa', 32)).to.equal('0000000000000000000000000000aaaa');
    expect(leftPad('aaaaa', 32)).to.equal('000000000000000000000000000aaaaa');
    expect(leftPad('aaaaaa', 32)).to.equal('00000000000000000000000000aaaaaa');
    expect(leftPad('aaaaaaa', 32)).to.equal('0000000000000000000000000aaaaaaa');
    expect(leftPad('aaaaaaaa', 32)).to.equal('000000000000000000000000aaaaaaaa');
    expect(leftPad('aaaaaaaaa', 32)).to.equal('00000000000000000000000aaaaaaaaa');
    expect(leftPad('aaaaaaaaaa', 32)).to.equal('0000000000000000000000aaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaa', 32)).to.equal('000000000000000000000aaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaa', 32)).to.equal('00000000000000000000aaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaa', 32)).to.equal('0000000000000000000aaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaa', 32)).to.equal('000000000000000000aaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaa', 32)).to.equal('00000000000000000aaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaa', 32)).to.equal('0000000000000000aaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaa', 32)).to.equal('000000000000000aaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaa', 32)).to.equal('00000000000000aaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaa', 32)).to.equal('0000000000000aaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaa', 32)).to.equal('000000000000aaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('00000000000aaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('0000000000aaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('000000000aaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('00000000aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('0000000aaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('000000aaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('00000aaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('0000aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('000aaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(leftPad('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 32)).to.equal('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('must left-pad to arbitrary lengths', () => {
    expect(leftPad('aaaaaaaa', 41)).to.equal('000000000000000000000000000000000aaaaaaaa');
    expect(leftPad('aaaaaaaa', 42)).to.equal('0000000000000000000000000000000000aaaaaaaa');
    expect(leftPad('aaaaaaaa', 43)).to.equal('00000000000000000000000000000000000aaaaaaaa');
    expect(leftPad('aaaaaaaa', 100)).to.equal(
      '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000aaaaaaaa'
    );
  });
});
