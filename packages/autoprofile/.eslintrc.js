module.exports = {
  extends: '../../.eslintrc.js',

  parserOptions: {
    ecmaVersion: 6
  },

  env: {
    es6: true
  },

  rules: {
    'class-methods-use-this': 'off'
  }
};
