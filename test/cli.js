const tape = require('tape');
const spawn = require('tape-spawn');
const pkg = require('../package.json');
const semver = require('semver');

var daodir;
if (semver.lt(pkg.version, '0.5.0')) {
  daodir = 'DAO040';
} else {
  daodir = 'DAO';
}

tape('CLI', function (t) {
  t.test('--version', function (st) {
    var spt = spawn(st, './polcjs --version');
    spt.stdout.match(RegExp(pkg.version + '(-[^a-zA-A0-9.+]+)?(\\+[^a-zA-Z0-9.-]+)?'));
    spt.stderr.empty();
    spt.end();
  });

  t.test('no parameters', function (st) {
    var spt = spawn(st, './polcjs');
    spt.stderr.match(/^Must provide a file/);
    spt.end();
  });

  t.test('no mode specified', function (st) {
    var spt = spawn(st, './polcjs test/' + daodir + '/Token.pol');
    spt.stderr.match(/^Invalid option selected/);
    spt.end();
  });

  t.test('--bin', function (st) {
    var spt = spawn(st, './polcjs --bin test/' + daodir + '/Token.pol');
    spt.stderr.empty();
    spt.succeeds();
    spt.end();
  });

  t.test('invalid file specified', function (st) {
    var spt = spawn(st, './polcjs --bin test/fileNotFound.pol');
    spt.stderr.match(/^Error reading /);
    spt.end();
  });

  t.test('incorrect source source', function (st) {
    var spt = spawn(st, './polcjs --bin test/fixtureIncorrectSource.pol');
    spt.stderr.match(/^test\/fixtureIncorrectSource.pol:1:1: SyntaxError: Invalid pragma "contract"/);
    spt.end();
  });

  t.test('--abi', function (st) {
    var spt = spawn(st, './polcjs --abi test/' + daodir + '/Token.pol');
    spt.stderr.empty();
    spt.succeeds();
    spt.end();
  });

  t.test('--bin --abi', function (st) {
    var spt = spawn(st, './polcjs --bin --abi test/' + daodir + '/Token.pol');
    spt.stderr.empty();
    spt.succeeds();
    spt.end();
  });

  t.test('standard json', function (st) {
    var input = {
      'language': 'Polynomial',
      'settings': {
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode', 'userdoc' ]
          }
        }
      },
      'sources': {
        'Contract.pol': {
          'content': 'pragma polynomial >=0.5.0; contract Contract { function f() pure public {} }'
        }
      }
    };
    var spt = spawn(st, './polcjs --standard-json');
    spt.stdin.setEncoding('utf-8');
    spt.stdin.write(JSON.stringify(input));
    spt.stdin.end();
    spt.stdin.on('finish', function () {
      spt.stderr.empty();
      spt.stdout.match(/Contract.pol/);
      spt.stdout.match(/userdoc/);
      spt.succeeds();
      spt.end();
    });
  });
});
