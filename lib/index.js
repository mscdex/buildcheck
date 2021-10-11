'use strict';

// TODO: Windows support (ugh)
// TODO: cache checkDeclared(), checkFunction() results
// TODO: take `compilerParams`, headers into account in cache for all cached
//       results
// TODO: debug output

const { spawnSync } = require('child_process');
const { inspect } = require('util');

const spawnOpts = {
  encoding: 'utf8',
  stdio: 'pipe',
  windowsHide: true,
};

function getKind(prop) {
  const result = spawnSync(
    this[prop],
    [ '-E', '-P', '-x', (prop === '_cc' ? 'c' : 'c++'), '-' ],
    {
      ...spawnOpts,
      input: [
        '__clang__',
        '__GNUC__',
        '__GNUC_MINOR__',
        '__GNUC_PATCHLEVEL__',
        '__clang_major__',
        '__clang_minor__',
        '__clang_patchlevel__',
      ].join(' '),
    }
  );

  if (result.status === 0) {
    const values = result.stdout.trim().split(' ');
    if (values.length === 7) {
      if (values[0] === '1') {
        // clang
        this[`${prop}Kind`] = 'clang';
        this[`${prop}Version`] = values.slice(4).map((v) => +v);
      } else {
        // GNU
        this[`${prop}Kind`] = 'gnu';
        this[`${prop}Version`] = values.slice(1, 4).map((v) => +v);
      }
    }
    return;
  }

  throw new Error('Unable to detect compiler type');
}

class BuildEnvironment {
  constructor(cfg) {
    if (typeof cfg !== 'object' || cfg === null)
      cfg = {};

    this._cc = ((typeof cfg.compilerC === 'string' && cfg.compilerC)
                || process.env.CC
                || 'cc');
    this._ccKind = undefined;
    this._ccVersion = undefined;

    this._cxx = ((typeof cfg.compilerCXX === 'string' && cfg.compilerCXX)
                 || process.env.CXX
                 || 'c++');
    this._cxxKind = undefined;
    this._cxxVersion = undefined;

    this._cache = new Map(Object.entries({
      c: new Map(),
      cxx: new Map(),
    }));
  }

  checkDeclared(type, symbolName, opts) {
    if (typeof symbolName !== 'string' || !symbolName)
      throw new Error(`Invalid symbol name: ${inspect(symbolName)}`);

    if (typeof opts !== 'object' || opts === null)
      opts = {};

    const { compilerParams, headers } = opts;
    const headersList = renderHeaders(headers, this);

    const declName = symbolName.replace(/ *\(.*/, '');
    const declUse = symbolName.replace(/\(/, '((')
                              .replace(/\)/, ') 0)')
                              .replace(/,/g, ') 0, (');
    const code = `
${headersList}

int
main ()
{
#ifndef ${declName}
#ifdef __cplusplus
  (void) ${declUse};
#else
  (void) ${declName};
#endif
#endif

  ;
  return 0;
}`;

    const result = this.tryCompile(type, code, compilerParams);
    return (result === true);
  }

  checkFeature(name) {
    const cached = getCachedValue('feature', this._cache, null, name);
    if (cached !== undefined)
      return cached;

    const feature = features.get(name);
    if (feature === undefined)
      throw new Error(`Invalid feature: ${name}`);

    let result = feature(this);
    if (result === undefined)
      result = null;
    setCachedValue('feature', this._cache, null, name, result);
    return result;
  }

  checkFunction(type, funcName, opts) {
    if (typeof funcName !== 'string' || !funcName)
      throw new Error(`Invalid function name: ${inspect(funcName)}`);

    if (typeof opts !== 'object' || opts === null)
      opts = {};

    const { compilerParams, headers } = opts;
    const headersList = renderHeaders(headers);

    const code = `
/* Define ${funcName} to an innocuous variant, in case <limits.h> declares
   ${funcName}.
   For example, HP-UX 11i <limits.h> declares gettimeofday.  */
#define ${funcName} innocuous_${funcName}
/* System header to define __stub macros and hopefully few prototypes,
   which can conflict with char ${funcName} (); below.  */
#include <limits.h>
#undef ${funcName}
/* Override any GCC internal prototype to avoid an error.
   Use char because int might match the return type of a GCC
   builtin and then its argument prototype would still apply.  */
#ifdef __cplusplus
extern "C"
#endif
char ${funcName} ();
/* The GNU C library defines this for functions which it implements
    to always fail with ENOSYS.  Some functions are actually named
    something starting with __ and the normal name is an alias.  */
#if defined __stub_${funcName} || defined __stub___${funcName}
choke me
#endif

${headersList}

int
main ()
{
return ${funcName} ();
  ;
  return 0;
}`;

    return (this.tryCompile(type, code, compilerParams) === true);
  }

  checkHeader(type, header, compilerParams) {
    const cached = getCachedValue(
      type,
      this._cache,
      'headers',
      normalizeHeader(header)
    );
    if (cached !== undefined)
      return cached;

    const headersList = renderHeaders([header]);

    const code = `
${headersList}

int
main ()
{
  return 0;
}`;

    const result = this.tryCompile(type, code, compilerParams);
    setCachedValue(
      type,
      this._cache,
      'headers',
      normalizeHeader(header),
      (result === true)
    );
    return (result === true);
  }

  tryCompile(type, code, compilerParams) {
    if (typeof code !== 'string')
      throw new TypeError('Invalid code argument');

    type = (type === 'c' ? 'c' : 'c++');
    const prop = (type === 'c' ? '_cc' : '_cxx');

    if (this[`${prop}Kind`] === undefined)
      getKind.call(this, prop);

    if (!Array.isArray(compilerParams))
      compilerParams = [];

    const result = spawnSync(
      this._cc,
      [
        '-x', type,
        '-o', '/dev/null',
        '-',
        ...compilerParams,
      ],
      {
        ...spawnOpts,
        input: code,
      }
    );

    if (result.status === 0)
      return true;

    const err = new Error('Compilation failed');
    err.output = result.stderr;
    return err;
  }
}

function getCachedValue(type, cache, subtype, key) {
  const typeCache = cache.get(type);
  if (!typeCache)
    return;

  const subtypeCache = (typeof subtype !== 'string'
                        ? typeCache
                        : typeCache.get(subtype));
  if (!subtypeCache)
    return;

  return subtypeCache.get(key);
}

function setCachedValue(type, cache, subtype, key, value) {
  let typeCache = cache.get(type);
  if (!typeCache)
    cache.set(type, typeCache = new Map());

  let subtypeCache = (typeof subtype !== 'string'
                      ? typeCache
                      : typeCache.get(subtype));
  if (!subtypeCache)
    typeCache.set(subtype, subtypeCache = new Map());

  subtypeCache.set(key, value);
}

function renderHeaders(headers, be) {
  let ret = '';

  if (be && (!Array.isArray(headers) || headers.length === 0))
    headers = getDefaultHeaders(be);

  if (Array.isArray(headers)) {
    for (const header of headers) {
      if (typeof header !== 'string' || !header)
        throw new Error(`Invalid header: ${inspect(header)}`);
      ret += `#include ${normalizeHeader(header)}\n`;
    }
  }

  return ret;
}

function normalizeHeader(header) {
  if (!/^".+"$/.test(header) && !/^<.+>$/.test(header))
    header = `<${header}>`;
  return header;
}

const DEFAULT_HEADERS = [
  'stdio.h',
  'sys/types.h',
  'sys/stat.h',
  'stdlib.h',
  'stddef.h',
  'memory.h',
  'string.h',
  'strings.h',
  'inttypes.h',
  'stdint.h',
  'unistd.h'
];
function getDefaultHeaders(be) {
  return DEFAULT_HEADERS.filter((hdr) => be.checkHeader('c', hdr));
}

const features = new Map(Object.entries({
  'strerror_r': (be) => {
    const declared = be.checkDeclared('c', 'strerror_r');
    let returnsCharPtr = false;
    if (declared) {
      const code = `
${renderHeaders(null, be)}

int
main ()
{

char buf[100];
char x = *strerror_r (0, buf, sizeof buf);
char *p = strerror_r (0, buf, sizeof buf);
return !p || x;

  ;
  return 0;
}`;
      returnsCharPtr = (be.tryCompile('c', code) === true);
    }

    return { declared, returnsCharPtr };
  },
}));

module.exports = BuildEnvironment;
