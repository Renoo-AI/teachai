// Per-request context (who is calling) available deep inside the AI code without passing it through every function.
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
module.exports = { run: (ctx, fn) => als.run(ctx, fn), get: () => als.getStore() || {} };
