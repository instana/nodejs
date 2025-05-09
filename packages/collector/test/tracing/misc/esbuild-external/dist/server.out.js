var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_serverless_collector = __toESM(require("@instana/serverless-collector"));
var import_axios = __toESM(require("axios"));
setInterval(async () => {
  try {
    await import_serverless_collector.default.sdk.async.startEntrySpan("execution-time", "custom", "blalba");
    const response = await import_axios.default.get("https://jsonplaceholder.typicode.com/posts/1");
    import_serverless_collector.default.sdk.async.completeEntrySpan();
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}, 10 * 1e3);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2VydmVyLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsa0NBQW9CO0FBQ3BCLG1CQUFrQjtBQUVsQixZQUFZLFlBQVk7QUFDdEIsTUFBSTtBQUNGLFVBQU0sNEJBQUFBLFFBQVEsSUFBSSxNQUFNLGVBQWUsa0JBQWtCLFVBQVUsUUFBUTtBQUMzRSxVQUFNLFdBQVcsTUFBTSxhQUFBQyxRQUFNLElBQUksOENBQThDO0FBQy9FLGdDQUFBRCxRQUFRLElBQUksTUFBTSxrQkFBa0I7QUFDcEMsWUFBUSxJQUFJLFNBQVMsSUFBSTtBQUFBLEVBQzNCLFNBQVMsT0FBTztBQUNkLFlBQVEsTUFBTSxLQUFLO0FBQUEsRUFDckI7QUFDRixHQUFHLEtBQUssR0FBSTsiLAogICJuYW1lcyI6IFsiaW5zdGFuYSIsICJheGlvcyJdCn0K
