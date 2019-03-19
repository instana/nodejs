module.exports = exports = function(prefix) {
  return function log() {
    var args = Array.prototype.slice.call(arguments);
    args[0] = '[' + prefix + ']: ' + args[0];
    console.log.apply(console, args);
  };
};
