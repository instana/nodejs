'use strict';

const expect = require('chai').expect;

const propertySizes = require('../../src/util/propertySizes');

describe('util.propertySizes', () => {
  it('should report sizes of first level attributes', () => {
    const sizes = propertySizes({
      string: 'Ohai!',
      number: 1234,
      booleanTrue: true,
      booleanFalse: false
    });

    expect(sizes.length).to.equal(4);
    expect(find(sizes, 'string')).to.equal(7);
    expect(find(sizes, 'number')).to.equal(4);
    expect(find(sizes, 'booleanTrue')).to.equal(4);
    expect(find(sizes, 'booleanFalse')).to.equal(5);
  });

  it('should not report undefined/null properties', () => {
    const sizes = propertySizes({
      nullValue: null,
      undefinedValue: undefined
    });

    expect(sizes.length).to.equal(0);
    expect(find(sizes, 'nullValue')).to.not.exist;
    expect(find(sizes, 'undefinedValue')).to.not.exist;
  });

  it('should not report nested properties', () => {
    const sizes = propertySizes({
      string: 'level 1',
      number: 1302,
      data: {
        string: 'level 2',
        number: 42,
        deeper: {
          string: 'level 3',
          number: 9001
        }
      }
    });

    expect(sizes.length).to.equal(6);
    expect(find(sizes, 'string')).to.equal(9);
    expect(find(sizes, 'number')).to.equal(4);
    expect(find(sizes, 'data.string')).to.equal(9);
    expect(find(sizes, 'data.number')).to.equal(2);
    expect(find(sizes, 'data.deeper.string')).to.equal(9);
    expect(find(sizes, 'data.deeper.number')).to.equal(4);
  });
});

function find(sizes, property) {
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i].property === property) {
      return sizes[i].length;
    }
  }
  return null;
}
