const Module = require('module');

const isBlacklisted = (blacklist, resolvedName) =>
  blacklist.size && blacklist.has(resolvedName);
const isWhitelisted = (whitelist, resolvedName) =>
  whitelist.size && !whitelist.has(resolvedName);
const isForbidden = (blacklist, whitelist, bare, moduleName, resolvedName) =>
  ((bare && require.resolve(moduleName) !== resolvedName) ||
   isBlacklisted(blacklist, resolvedName) ||
   isWhitelisted(whitelist, resolvedName));

const getEnsurer = (blacklist, whitelist, bare, moduleName) => resolvedName => {
  if (isForbidden(blacklist, whitelist, bare, moduleName, resolvedName)) {
    throw new Error(
       `Module '${moduleName}' has attempted forbidden action with module '${resolvedName}'`
    );
  }
};

module.exports = (moduleName, { blacklist=[], whitelist=[], bare=false }={}) => {
  if (blacklist.length && whitelist.length) {
    throw new Error('You cannot snykwire with both a blacklist and a whitelist');
  }

  if (bare && (blacklist.length || whitelist.length)) {
    throw new Error('You cannot use bare snykwire with either a blacklist or a whitelist');
  }

  blacklist = new Set(blacklist.map(require.resolve));
  whitelist = new Set(whitelist.map(require.resolve));
  const ensure = getEnsurer(blacklist, whitelist, bare, moduleName);

  const cache = Module._cache;

  Module._cache = new Proxy(cache, {
    get(target, resolvedName) {
      ensure(resolvedName);
      return target[resolvedName];
    },

    set(target, resolvedName, mod) {
      ensure(resolvedName);
      target[resolvedName] = mod;
      return true;
    },

    has(target, resolvedName) {
      ensure(resolvedName);
      return resolvedName in target;
    },

    deleteProperty(target, resolvedName) {
      ensure(resolvedName);
      delete target[resolvedName];
      return true;
    },

    preventExtensions(target) {
      throw new Error(`Module '${moduleName}' tried to lock your module cache`);
    },
  });
  try {
    return require(moduleName);
  } finally {
    Module._cache = cache;
  }
};
