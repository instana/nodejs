module.exports = {
  extends: '../.eslintrc.js',

  env: {
    mocha: true
  },

  rules: {
    'monorepo-cop/no-relative-import-outside-package': 'off'
  }
};
