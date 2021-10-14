# Description

Build environment checking for [node.js](http://nodejs.org/).

This allows for autoconf-like functionality for node addons/build scripts.

**Note:** Obsolete and/or exotic build environments or platforms not supported
by node.js are not supported.

## Requirements

* [node.js](http://nodejs.org/) -- v10.0.0 or newer
* gcc _or_ clang

## Installation

    npm install buildcheck

## Examples

### Check if a C function exists

```js
'use strict';

const { BuildEnvironment } = require('buildcheck');

const buildEnv = new BuildEnvironment();

console.log(buildEnv.checkFunction('c', 'preadv2'));
```

### Check if a C header is usable

```js
'use strict';

const { BuildEnvironment } = require('buildcheck');

const buildEnv = new BuildEnvironment();

console.log(buildEnv.checkHeader('c', 'linux/io_uring.h'));
```

### Try to compile some C code

```js
'use strict';

const { BuildEnvironment } = require('buildcheck');

const buildEnv = new BuildEnvironment();

// Should be a successful compile
console.log(buildEnv.tryCompile('c', 'int main() { return 0; }'));

// Should be a failed compile
console.log(buildEnv.tryCompile('c', 'int main() { return z; }'));
```

## API

### Exports

* `BuildEnvironment` - The main class for dealing with a build environment.

### BuildEnvironment

#### Methods

* **(constructor)**([< _object_ >config]) - Creates and returns a new BuildEnvironment instance. `config` may contain:

  * **compilerC** - _string_ - C compiler command to use. **Default:** `process.env.CC` or `'cc'`

  * **compilerCXX** - _string_ - C++ compiler command to use. **Default:** `process.env.CXX` or `'c++'`

* **checkDeclared**(< _string_ >lang, < _string_ >symbolName[, < _object_ >options]) - _boolean_ - Checks if a symbol `symbolName` is declared where `lang` is either `'c'` or `'c++'`. Returns `true` if symbol exists, `false` otherwise. `options` may contain:

  * **compilerParams** - _array_ - A list of compiler/linker flags to include when testing.

* **checkFunction**(< _string_ >lang, < _string_ >functionName[, < _object_ >options]) - _boolean_ - Checks if a function `functionName` exists and is linkable where `lang` is either `'c'` or `'c++'`. Returns `true` if function exists, `false` otherwise. `options` may contain:

  * **searchLibs** - _array_ - A list of library names (without the `'-l'` prefix) to try when checking for this function. `checkFunction()` will always first try without a library.

* **checkFeature**(< _string_ >featureName) - _mixed_ - Executes a special test for a "feature" and returns the result. Supported values for `featureName`:

  * `'strerror_r'` - Returns an object containing:

    * `declared` - _boolean_ - Whether `strerror_r()` is declared

    * `returnsCharPtr` - _boolean_ - If `strerror_r()` is declared, whether it returns `char*` (a GNU extension) or not.

* **checkHeader**(< _string_ >lang, < _string_ >headerName[, < _array_ >compilerParams]) - _boolean_ - Checks if the header `headerName` exists and is usable where `lang` is either `'c'` or `'c++'`. `compilerParams` is an optional list of compiler/linker flags to include when testing. Returns `true` if the header exists and is usable, `false` otherwise.

* **defines**([< _string_ >lang[, < _boolean_ >rendered]]) - _array_ - Returns a list of features, functions, headers, and symbols known to be defined by this build environment instance. `lang` is either `'c'` or `'c++'` If `lang` is not set, defines for both `'c'` and `'c++'` will be returned. If `rendered` is `true` (defaults to `false`), autoconf-style defines (e.g. "HAVE_FOO=1") will be returned instead. Defines coming from features utilize base strings/names from autoconf for better compatibility.

* **libs**([< _string_ >lang]) - _array_ - Returns a list of (`'-l'`-prefixed) libraries known to be required for features and functions defined by this build environment instance. `lang` is either `'c'` or `'c++'` If `lang` is not set, defines for both `'c'` and `'c++'` will be returned.

* **tryCompile**(< _string_ >lang, < _string_ >code[, < _array_ >compilerParams]) - _mixed_ - Attempts to compile `code` where `lang` is either `'c'` or `'c++'`. `compilerParams` is an optional array of compiler/linker flags to include. Returns `true` on successful compilation, or an _Error_ instance with an `output` property containing the compiler error output.
