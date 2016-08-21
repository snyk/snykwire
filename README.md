---
layout: post		
title: Using ES2015 Proxy for fun and profit
author: alon-niv
by: Alon Niv
main-image: https://upload.wikimedia.org/wikipedia/commons/f/f1/Straining_a_cocktail.jpg
excerpt: "Much has been written about ES2015 - with its arrow functions, scoped variable declarations and controversial classes. However, a certain feature has received little love so far: the Proxy."
---


[Much](https://themeteorchef.com/blog/what-is-es2015/) [has](https://css-tricks.com/lets-learn-es2015/) [been written](https://babeljs.io/docs/learn-es2015/) [about ES2015](http://es6-features.org/) - with its arrow functions, scoped variable declarations and controversial classes.

However, a certain feature has received little love so far: the `Proxy`.
As JS developers, we're not used to rely on trapping mechanisms throughout out codebase, but they have several very useful applications. To name a few:

- Testing, mocking and monkeypatching
- The `Observer` and `Visitor` design patterns
- Abstractions over complicated concepts

Until now, the language hasn't provided us with any way such mechanism.
I feel like the [Proxy](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy) solves this problem, while keeping the feel of the JS we know and love (i.e. no `[Symbol.__setattr__]` methods for our objects).

The `Proxy` constructor accepts 2 parameters:

- `target`: this is the Object we want to proxy around
- `handler`: this is an Object containing the spec for the traps we want to handle (a trap, in this sense, is a function that is being called on certain events happening to the proxy, such as a property being accessed, set or deleted) - examples follow.

In this post, I'll try to give an example usage for the most common traps (`get`, `set`, `has` and `deleteProperty`), and in keeping with the Snyk spirit, it's going to be about dependencies.

### Our goal
We want to create a package that allows a developer to safely `require` modules, while making sure they, in turn,
don't `require` something better left alone.

### Enter the `module` module
I'm only including this part because, while node's [docs](https://nodejs.org/api/modules.html) do a pretty great job on explaining this, we're about to do some nifty things to the modules cache, so I want to make sure the `require` flow is clear:

- Module `x` `require`s module `y`
- Name `y` is resolved to an absolute path (or not, if it's a core module, such as `fs`)
- The resolved name is fetched from the cache, *without* checking for its existence
- If the fetched value is defined (a Module object), the exported values are returned
- Otherwise, ~~some magic happens~~ node actually fetches the file from the FS, and compiles it into a Module object, which is put into the cache, and has its exported values returned.

This cache is a global singleton, accessible via `require('module')._cache` and `require.cache`, and is a plain JS Object.

### Finally, some code
For simplicity's sake, let's assume we just want to provide a blacklisting interface for modules that shouldn't be used by our required module. It's going to look like this:

```js
const snykwire = require('snykwire'); // our code here, patent pending ;)
const nefarious = snykwire('nefarious', ['fs', 'net']); // don't allow this module access either 'fs' nor 'net' core modules
```

Okay, so now we have a feel for what it's going to look like, let's start coding:

```js
// snykwire/index.js

const Module = require('module'); // we need this to access the global cache

module.exports = (moduleName, blacklist=[]) => {
  // let's make sure we have a set of RESOLVED blacklisted
  // modules we can easily check against.
  const blackSet = new Set(blacklist.map(require.resolve));
  // we're going to save a reference to the "clean" version of the cache,
  // so we can set it right afterwards
  const cache = Module._cache;
  Module._cache = new Proxy(cache, {
    /*
     * As I mentioned before, fetching [resolvedName] from the cache is
     * the first thing attempted, so we can be sure to trap any `require` call
     * here.
     * The `get` trap accepts 2 parameters: `target` (which is the object being
     * proxied - i.e. the cache) and the property being accessed (here it's the
     * resolved name of the module being accessed).
     * If we don't declare this trap, every property accessed will be passed
     * directly to the target, as if there were no proxy at all.
     */
    get(target, resolvedName) {
      if (blackSet.has(resolvedName)) {
        // we could return a dummy module here, but it's easier to just throw an error for now
        throw new Error(
          `Module '${moduleName}' has attempted to access module '${resolvedName}'`
        );
      }
      // else, just act natural
      return target[resolvedName];
    }
  });
  try {
    // let's see if we can require the module now... ^-*_*-^
    return require(moduleName);
  } finally {
    // and... let's put things back where they belong
    Module._cache = cache;
  }
};
```

Cool, we're done, right?
Well, not exactly. Yes, we made sure our nefarious module can't `require` a blacklisted module, but there are other dirty tricks it can pull off:

```js
// nefarious/index.js

// require('fs').writeFileSync('/eta/passwd', 'muhahaha');
// Drat! Foiled! Let's try something else...

require.cache.fs = {
  exports: {
    readFile() {
      process.exit(1); // muhahaha!
    }
  }
}
```

*Side-note about `require.cache`:* if you want to corrupt a single module in the module cache, use `require.cache`.
If, however, you want to switch out the entire caching mechanism, use `require('module')._cache = ...`.

Let's fix our code to handle this situation:

```js
// ...
Module._cache = new Proxy(cache, {
  get(target, resolvedName) {
    if (blackSet.has(resolvedName)) {
      throw new Error(
        `Module '${moduleName}' has attempted to access module '${resolvedName}'`
      );
    }
    return target[resolvedName];
  },
  /*
   * The `set` trap accepts 3 parameters: `target` (which is the object being
   * proxied - i.e. the cache), the property being set (here it's the
   * resolved name of the module being accessed) and the actual Module object.
   * If we don't declare this trap, every property set will be set
   * directly to the target, as if there were no proxy at all.
   */
  set(target, resolvedName, mod) {
    if (blackSet.has(resolvedName)) {
      throw new Error(
        `Module '${moduleName}' has attempted to corrupt module '${resolvedName}'`
      );
    }
    target[resolvedName] = mod;
    // the `set` trap has to return `true` if it succeeded.
    // Returning a falsy value will throw a `TypeError`.
    return true;
  }
// ...
```

And... now we're done... right? Nope. Let's consider this nefarious code:

```js
// nefarious/index.js

if ('fs' in require.cache) {
  delete require.cache.fs;
  // if I can't use it, nobody can!
  // (as long as they run in strict mode...)
  Object.freeze(require.cache);
}
```

Let's just add some last touches, then:

```js
// ...
Module._cache = new Proxy(cache, {
  get(target, resolvedName) {
    throwIfForbidden(blackSet, resolvedName);
    return target[resolvedName];
  },
  set(target, resolvedName, mod) {
    throwIfForbidden(blackSet, resolvedName);
    target[resolvedName] = mod;
    return true;
  },
  // This traps `resolvedName in proxy`
  has(target, resolvedName) {
    throwIfForbidden(blackSet, resolvedName);
    return resolvedName in target;
  },
  // This traps `delete proxy[resolvedName]`
  deleteProperty(target, resolvedName) {
    throwIfForbidden(blackSet, resolvedName);
    delete target[resolvedName];
    // like with the `set` trap, return `true` on success
    return true;
  },
  // Traps Object.preventExtensions, and by extension, Object.freeze
  preventExtensions(target) {
    // Let's not let anyone mess with our cache
    throw new Error(`Module '${moduleName}' tried to lock your module cache`);
  }
// ...
```

And **now** we're done. Or, at least, I think so.

Do you have an idea how to circumvent this proxy? Share them with us on Twitter [@snyksec](https://twitter.com/snyksec)!



*The repo for this POC is available [here](https://github.com/Snyk/snykwire)*
