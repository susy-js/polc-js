#!/usr/bin/env node

var semver = require('semver');

var packageVersion = require('./package.json').version;
var polcVersion = require('./index.js').version();

console.log('polcVersion: ' + polcVersion);
console.log('packageVersion: ' + packageVersion);

if (semver.eq(packageVersion, polcVersion)) {
  console.log('Version matching');
  process.exit(0);
} else {
  console.log('Version mismatch');
  process.exit(1);
}
