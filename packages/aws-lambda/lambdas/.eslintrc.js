module.exports = {
  rules: {
    // We do not run npm install in the example lambda directories on CI, so this check would fail for all dependencies
    // (the rule compares the require statements to what is acutally present in node_modules).
    'import/no-unresolved': 'off',
    'no-console': 'off'
  }
};
