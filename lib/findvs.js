'use strict';

const { execFileSync } = require('child_process');
const { readFileSync, statSync } = require('fs');
const { win32: path } = require('path');

const VS_VERSIONS_MODERN = new Map([
  [15, {
    year: 2017,
    msbuild: path.join('MSBuild', '15.0', 'Bin', 'MSBuild.exe'),
    toolset: 'v141',
  }],
  [16, {
    year: 2019,
    msbuild: path.join('MSBuild', 'Current', 'Bin', 'MSBuild.exe'),
    toolset: 'v142',
  }],
]);
const PACKAGES = {
  msbuild: 'Microsoft.VisualStudio.VC.MSBuild.Base',
  vctools: 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  express: 'Microsoft.VisualStudio.WDExpress',
  win8sdk: 'Microsoft.VisualStudio.Component.Windows81SDK',
  win10sdkPrefix: 'Microsoft.VisualStudio.Component.Windows10SDK.',
};
const SDK_REG = 'HKLM\\Software\\Microsoft\\Microsoft SDKs\\Windows';
const SDK32_REG =
  'HKLM\\Software\\Wow6432Node\\Microsoft\\Microsoft SDKs\\Windows';

// Sorts newest to oldest
function versionStringCompare(a, b) {
  const splitA = a.split('.');
  const splitB = b.split('.');
  const len = Math.min(splitA.length, splitB.length);
  for (let i = 0; i < len; ++i) {
    const nA = parseInt(splitA[i], 10);
    const nB = parseInt(splitB[i], 10);
    if (nA > nB)
      return -1;
    if (nA < nB)
      return 1;
  }
  if (splitA.length > splitB.length)
    return -1;
  else if (splitA.length < splitB.length)
    return 1;
  return 0;
}

const execOpts = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
};

function findModernVS() {
  const versions = [];
  const ps = path.join(
    process.env.SystemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  const cs = path.resolve(__dirname, '..', 'deps', 'Find-VisualStudio.cs');
  const args = [
    '-ExecutionPolicy',
    'Unrestricted',
    '-NoProfile',
    '-Command',
    `&{Add-Type -Path '${cs}';[VisualStudioConfiguration.Main]::PrintJson()}`
  ];
  try {
    const out = execFileSync(ps, args, execOpts);
    const info = JSON.parse(out);
    if (Array.isArray(info)) {
      for (const vs of info) {
        const vsPath = path.resolve(vs.path);
        let vsVer = /^(?<major>\d+)[.](?<minor>\d+)[.]/.exec(vs.version);
        if (!vsVer)
          continue;
        vsVer = {
          full: vs.version,
          major: +vsVer.groups.major,
          minor: +vsVer.groups.minor,
        };
        const verInfo = VS_VERSIONS_MODERN.get(vsVer.major);
        if (verInfo === undefined)
          continue;
        if (!Array.isArray(vs.packages)
            || !vs.packages.includes(PACKAGES.msbuild)
            || (!vs.packages.includes(PACKAGES.vctools)
                && !vs.packages.includes(PACKAGES.express))) {
          continue;
        }
        const vsSDKs = [];
        for (const pkg of vs.packages) {
          if (pkg === PACKAGES.win8sdk) {
            vsSDKs.push('8.1');
            continue;
          }
          if (!pkg.startsWith(PACKAGES.win10sdkPrefix))
            continue;
          const split = pkg.split('.');
          if (split.length > 5 && split[5] !== 'Desktop')
            continue;
          const sdkVer = parseInt(split[4], 10);
          if (!isFinite(sdkVer) || sdkVer < 0)
            continue;
          vsSDKs.push(`10.0.${sdkVer}.0`);
        }
        if (vsSDKs.length === 0)
          continue;
        let clPath;
        const includePaths = [];
        const libPaths = [];
        try {
          const vcVerFile = path.join(
            vsPath,
            'VC',
            'Auxiliary',
            'Build',
            `Microsoft.VCToolsVersion.${verInfo.toolset}.default.txt`
          );
          const clVer = readFileSync(vcVerFile, { encoding: 'utf8' }).trim();
          const arch = (process.arch === 'ia32' ? 'x86' : 'x64');
          let testPath = path.join(
            vsPath,
            'VC',
            'Tools',
            'MSVC',
            clVer,
            'bin',
            `Host${arch}`,
            arch,
            'cl.exe'
          );
          statSync(testPath);
          clPath = testPath;

          testPath = path.join(
            vsPath,
            'VC',
            'Tools',
            'MSVC',
            clVer,
            'include'
          );
          statSync(testPath);
          includePaths.push(testPath);
          // TODO: make includePaths dynamic/function since it's dependent
          //       on SDK
          const SDKFullVer = vsSDKs[0];
          const SDKShortVer = `v${/^\d+[.]\d+/.exec(SDKFullVer)[0]}`;
          let SDKPath = getRegValue(
            `${SDK_REG}\\${SDKShortVer}`,
            'InstallationFolder'
          );
          if (!SDKPath) {
            SDKPath = getRegValue(
              `${SDK32_REG}\\${SDKShortVer}`,
              'InstallationFolder'
            );
          }
          if (!SDKPath)
            continue;
          testPath = path.resolve(SDKPath, 'Include', SDKFullVer, 'ucrt');
          statSync(testPath);
          includePaths.push(testPath);

          testPath = path.join(
            vsPath,
            'VC',
            'Tools',
            'MSVC',
            clVer,
            'lib',
            arch
          );
          statSync(testPath);
          libPaths.push(testPath);
          // TODO: make libPaths dynamic/function since it's dependent
          //       on SDK
          testPath = path.resolve(SDKPath, 'Lib', SDKFullVer, 'um', arch);
          statSync(testPath);
          libPaths.push(testPath);
          testPath = path.resolve(SDKPath, 'Lib', SDKFullVer, 'ucrt', arch);
          statSync(testPath);
          libPaths.push(testPath);
        } catch {
          continue;
        }
        vsSDKs.sort(versionStringCompare);
        versions.push({
          path: vsPath,
          version: vsVer,
          sdks: vsSDKs,
          ...verInfo,
          msbuild: path.join(vsPath, verInfo.msbuild),
          cl: clPath,
          includePaths,
          libPaths,
        });
      }
    }
  } catch {}
  return versions;
}

const VS_VERSIONS_OLDER = [
  {
    version: { full: '12.0', major: 12, minor: 0 },
    year: 2013,
    toolset: 'v120',
  },
  {
    version: { full: '14.0', major: 14, minor: 0 },
    year: 2015,
    toolset: 'v140',
  },
];

const VC_REG = 'HKLM\\Software\\Microsoft\\VisualStudio\\SxS\\VC7';
const VC32_REG =
  'HKLM\\Software\\Wow6432Node\\Microsoft\\VisualStudio\\SxS\\VC7';
const MSBUILD_REG = 'HKLM\\Software\\Microsoft\\MSBuild\\ToolsVersions';

function getRegValue(key, value, use32) {
  const extraArgs = (use32 ? [ '/reg:32' ] : []);
  const regexp = new RegExp(`^\\s+${value}\\s+REG_\\w+\\s+(\\S.*)$`, 'im');
  const reg = path.join(process.env.SystemRoot, 'System32', 'reg.exe');
  const args = [ 'query', key, '/v', value, ...extraArgs ];

  try {
    const out = execFileSync(reg, args, execOpts);
    const m = regexp.exec(out);
    if (m)
      return m[1];
  } catch {}
}

function findOlderVS() {
  const versions = [];
  try {
    for (const vs of VS_VERSIONS_OLDER) {
      let vsPath = getRegValue(VC_REG, vs.version.full);
      if (!vsPath)
        vsPath = getRegValue(VC32_REG, vs.version.full);
      if (!vsPath)
        continue;
      vsPath = path.resolve(vsPath, '..');

      const msbuildPath = getRegValue(
        `${MSBUILD_REG}\\${vs.version.full}`,
        'MSBuildToolsPath',
        (process.arch === 'ia32')
      );
      if (!msbuildPath)
        continue;
      versions.push({
        path: vsPath,
        ...vs,
        msbuild: path.join(msbuildPath, 'MSBuild.exe'),
        cl: path.join(vsPath, 'VC', 'bin', 'cl.exe'),
        // TODO: include SDK dirs in includePaths, libPaths
        includePaths: [path.join(vsPath, 'VC', 'include')],
        libPaths: [path.join(vsPath, 'VC', 'lib')],
        sdks: [],
      });
    }
  } catch {}
  return versions;
}

module.exports = () => {
  const versions = findModernVS().concat(findOlderVS());
  // Sorts newest to oldest
  versions.sort((a, b) => {
    return versionStringCompare(a.version.full, b.version.full);
  });
  return versions;
};