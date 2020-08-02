module.exports = {
  extends: '../../../.eslintrc.js',

  env: {
    es6: true,
    mocha: true
  },

  parserOptions: {
    ecmaVersion: 2018
  },

  rules: {
    'object-curly-newline': 'off'
  }
};
