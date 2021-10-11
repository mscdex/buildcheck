'use strict';

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

    this._cxx = ((typeof cfg.compilerCPP === 'string' && cfg.compilerCPP)
                 || process.env.CXX
                 || 'c++');
    this._cxxKind = undefined;
    this._cxxVersion = undefined;
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
        ...compilerParams,
        '-'
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

  checkFunction(type, funcName, opts) {
    if (typeof funcName !== 'string' || !funcName)
      throw new Error(`Invalid function name: ${inspect(funcName)}`);

    if (typeof opts !== 'object' || opts === null)
      opts = {};

    const { compilerParams, headers } = opts;
    let headersList = '';
    if (Array.isArray(headers)) {
      for (let header of headers) {
        if (typeof header !== 'string' || !header)
          throw new Error(`Invalid header: ${inspect(header)}`);

        if (!/^".+"$/.test(header))
          header = `<${header}>`;

        headersList += `#include ${header}\n`;
      }
    }

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

  checkHeaders(type, headers, compilerParams) {
    let headersList = '';
    if (!Array.isArray(headers))
      headers = [headers];
    for (let header of headers) {
      if (typeof header !== 'string' || !header)
        throw new Error(`Invalid header: ${inspect(header)}`);

      if (!/^".+"$/.test(header))
        header = `<${header}>`;

      headersList += `#include ${header}\n`;
    }

    const code = `
${headersList}

int
main ()
{
  return 0;
}`;

    return (this.tryCompile(type, code, compilerParams) === true);
  }
}

module.exports = BuildEnvironment;
