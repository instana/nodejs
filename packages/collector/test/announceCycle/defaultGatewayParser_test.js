/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const path = require('path');
const chai = require('chai');
chai.use(require('chai-as-promised'));
const {
  _convertToIp,
  _isDefaultGatewayLine,
  _parseFile,
  init
} = require('../../src/announceCycle/defaultGatewayParser');
const testUtils = require('@_local/core/test/test_util');

const { expect } = chai;

describe('get default gateway from /proc/self/net/route', () => {
  before(() => {
    init({ logger: testUtils.createFakeLogger() });
  });

  it('should recognize default gateway line', () => {
    expect(_isDefaultGatewayLine(['eth0', '00000000', '010011AC', '0003', '0', '0', '0', '000000000', '0', '0'])).to.be
      .true;
  });

  it('should ignore header line', () => {
    expect(
      _isDefaultGatewayLine([
        'Iface',
        'Destination',
        'Gateway ',
        'Flags',
        'RefCnt',
        'Use',
        'Metric',
        'Mask',
        'MTU',
        'Window',
        'IRTT'
      ])
    ).to.be.false;
  });

  it('should ignore short lines', () => {
    expect(_isDefaultGatewayLine(['eth0', '00000000'])).to.be.false;
  });

  it('should ignore other lines', () => {
    expect(_isDefaultGatewayLine(['eth0', '00000001', '010011AC', '0003', '0', '0', '0', '000000000', '0', '0'])).to.be
      .false;
  });

  it('should ignore lines when third field does not have 8 characters', () => {
    expect(_isDefaultGatewayLine(['eth0', '00000000', '010011AC123', '0003', '0', '0', '0', '000000000', '0', '0'])).to
      .be.false;
    expect(_isDefaultGatewayLine(['eth0', '00000000', '010011', '0003', '0', '0', '0', '000000000', '0', '0'])).to.be
      .false;
  });

  it('should convert to IP', () => {
    const defaultGateway = _convertToIp(['eth0', '00000000', '010011AC', '0003', '0', '0', '0', '000000000', '0', '0']);
    expect(defaultGateway).to.equal('172.17.0.1');
  });

  it('should read and parse file', async () => {
    const defaultGateway = await _parseFile(path.join(__dirname, 'proc-self-net-route'));
    expect(defaultGateway).to.equal('172.16.0.1');
  });

  it('should return null if there is no matching line', async () => {
    const defaultGateway = await _parseFile(path.join(__dirname, 'proc-self-net-route-no-matching-line'));
    expect(defaultGateway).to.be.null;
  });

  it('should throw an error when the file is absent', async () => {
    return expect(_parseFile(path.join(__dirname, 'does-not-exist')))
      .to.eventually.be.rejectedWith('does not exist')
      .and.be.an.instanceOf(Error);
  });
});
