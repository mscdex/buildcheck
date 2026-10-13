'use strict';

const assert = require('assert');

const BE = require('..');

{
  // Test compiler detection
  new BE({ debug: console.log });
}

if (process.platform !== 'win32') {
  // Test compiler commands with arguments (`env` stands in for a wrapper like
  // ccache)
  const args = `-DFOO=1 '-DBAR=1 + 1' "-DBAZ=2 * 3"`;
  process.env.CC = `env ${process.env.CC || 'cc'} ${args}`;
  process.env.CXX = `env ${process.env.CXX || 'c++'} ${args}`;
  const be = new BE({ debug: console.log });
  const code = `
int
main ()
{
#if FOO != 1 || BAR != 2 || BAZ != 6
  choke me
#endif
  return 0;
}`;
  assert.strictEqual(be.tryCompile('c', code), true);
  assert.strictEqual(be.tryCompile('c++', code), true);
}
