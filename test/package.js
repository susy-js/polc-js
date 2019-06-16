const tape = require('tape');
const semver = require('semver');
const polc = require('../index.js');
const linker = require('../linker.js');

function getBytecode (output, fileName, contractName) {
  try {
    var outputContract;
    if (semver.lt(polc.semver(), '0.4.9')) {
      outputContract = output.contracts[contractName];
    } else {
      outputContract = output.contracts[fileName + ':' + contractName];
    }
    return outputContract['bytecode'];
  } catch (e) {
    return '';
  }
}

function getBytecodeStandard (output, fileName, contractName) {
  try {
    var outputFile;
    if (semver.lt(polc.semver(), '0.4.9')) {
      outputFile = output.contracts[''];
    } else {
      outputFile = output.contracts[fileName];
    }
    return outputFile[contractName]['svm']['bytecode']['object'];
  } catch (e) {
    return '';
  }
}

tape('Version and license', function (t) {
  t.test('check version', function (st) {
    st.equal(typeof polc.version(), 'string');
    st.end();
  });
  t.test('check semver', function (st) {
    st.equal(typeof polc.semver(), 'string');
    st.end();
  });
  t.test('check license', function (st) {
    st.ok(typeof polc.license() === 'undefined' || typeof polc.license() === 'string');
    st.end();
  });
});

tape('Compilation', function (t) {
  t.test('single files can be compiled (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileSingle !== 'function') {
      st.skip('Low-level compileSingle interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var output = JSON.parse(polc.lowlevel.compileSingle('contract x { function g() public {} }'));
    st.ok('contracts' in output);
    var bytecode = getBytecode(output, '', 'x');
    st.ok(bytecode);
    st.ok(bytecode.length > 0);
    st.end();
  });

  t.test('invalid source code fails properly (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileSingle !== 'function') {
      st.skip('Low-level compileSingle interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var output = JSON.parse(polc.lowlevel.compileSingle('contract x { this is an invalid contract }'));
    if (semver.lt(polc.semver(), '0.1.4')) {
      st.ok(output.error.indexOf('Parser error: Expected identifier') !== -1);
      st.end();
      return;
    }
    st.plan(3);
    st.ok('errors' in output);
    // Check if the ParserError exists, but allow others too
    st.ok(output.errors.length >= 1);
    for (var error in output.errors) {
      // Error should be something like:
      //   ParserError
      //   Error: Expected identifier
      //   Parser error: Expected identifier
      if (
        output.errors[error].indexOf('ParserError') !== -1 ||
        output.errors[error].indexOf('Error: Expected identifier') !== -1 ||
        output.errors[error].indexOf('Parser error: Expected identifier') !== -1
      ) {
        st.ok(true);
      }
    }
    st.end();
  });

  t.test('multiple files can be compiled (using lowlevel API)', function (st) {
    // Introduced in 0.1.6
    if (typeof polc.lowlevel.compileMulti !== 'function') {
      st.skip('Low-level compileMulti interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'lib.pol': 'library L { function f() public returns (uint) { return 7; } }',
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    var output = JSON.parse(polc.lowlevel.compileMulti(JSON.stringify({sources: input})));
    var x = getBytecode(output, 'cont.pol', 'x');
    st.ok(x);
    st.ok(x.length > 0);
    var L = getBytecode(output, 'lib.pol', 'L');
    st.ok(L);
    st.ok(L.length > 0);
    st.end();
  });

  t.test('lazy-loading callback works (using lowlevel API)', function (st) {
    // Introduced in 0.2.1
    if (typeof polc.lowlevel.compileCallback !== 'function') {
      st.skip('Low-level compileCallback interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    function findImports (path) {
      if (path === 'lib.pol') {
        return { contents: 'library L { function f() public returns (uint) { return 7; } }' };
      } else {
        return { error: 'File not found' };
      }
    }
    var output = JSON.parse(polc.lowlevel.compileCallback(JSON.stringify({sources: input}), 0, findImports));
    var x = getBytecode(output, 'cont.pol', 'x');
    var L = getBytecode(output, 'lib.pol', 'L');
    st.ok(x);
    st.ok(x.length > 0);
    st.ok(L);
    st.ok(L.length > 0);
    st.end();
  });

  t.test('lazy-loading callback works (with file not found) (using lowlevel API)', function (st) {
    // <0.2.1 doesn't have this
    if (typeof polc.lowlevel.compileCallback !== 'function') {
      st.skip('Low-level compileCallback interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    function findImports (path) {
      return { error: 'File not found' };
    }
    var output = JSON.parse(polc.lowlevel.compileCallback(JSON.stringify({sources: input}), 0, findImports));
    st.plan(3);
    st.ok('errors' in output);
    // Check if the ParserError exists, but allow others too
    st.ok(output.errors.length >= 1);
    for (var error in output.errors) {
      // Error should be something like:
      //   cont.pol:1:1: ParserError: Source "lib.pol" not found: File not found
      //   cont.pol:1:1: Error: Source "lib.pol" not found: File not found
      if (output.errors[error].indexOf('Error') !== -1 && output.errors[error].indexOf('File not found') !== -1) {
        st.ok(true);
      }
    }
    st.end();
  });

  t.test('lazy-loading callback works (with exception) (using lowlevel API)', function (st) {
    // <0.2.1 doesn't have this
    if (typeof polc.lowlevel.compileCallback !== 'function') {
      st.skip('Low-level compileCallback interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    function findImports (path) {
      throw new Error('Could not implement this interface properly...');
    }
    st.throws(function () {
      polc.lowlevel.compileCallback(JSON.stringify({sources: input}), 0, findImports);
    }, /^Error: Could not implement this interface properly.../);
    st.end();
  });

  t.test('lazy-loading callback fails properly (with invalid callback) (using lowlevel API)', function (st) {
    // <0.2.1 doesn't have this
    if (typeof polc.lowlevel.compileCallback !== 'function') {
      st.skip('Low-level compileCallback interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    st.throws(function () {
      polc.lowlevel.compileCallback(JSON.stringify({sources: input}), 0, "this isn't a callback");
    }, /Invalid callback specified./);
    st.end();
  });

  t.test('file import without lazy-loading callback fails properly (using lowlevel API)', function (st) {
    // <0.2.1 doesn't have this
    if (typeof polc.lowlevel.compileCallback !== 'function') {
      st.skip('Low-level compileCallback interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'cont.pol': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
    };
    var output = JSON.parse(polc.lowlevel.compileCallback(JSON.stringify({sources: input})));
    st.plan(3);
    st.ok('errors' in output);
    // Check if the ParserError exists, but allow others too
    st.ok(output.errors.length >= 1);
    for (var error in output.errors) {
      // Error should be something like:
      //   cont.pol:1:1: ParserError: Source "lib.pol" not found: File import callback not supported
      //   cont.pol:1:1: Error: Source "lib.pol" not found: File import callback not supported
      if (output.errors[error].indexOf('Error') !== -1 && output.errors[error].indexOf('File import callback not supported') !== -1) {
        st.ok(true);
      }
    }
    st.end();
  });

  t.test('compiling standard JSON (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileStandard !== 'function') {
      st.skip('Low-level compileStandard interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'lib.pol': {
          'content': 'library L { function f() public returns (uint) { return 7; } }'
        },
        'cont.pol': {
          'content': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
        }
      }
    };

    function bytecodeExists (output, fileName, contractName) {
      try {
        return output.contracts[fileName][contractName]['svm']['bytecode']['object'].length > 0;
      } catch (e) {
        return false;
      }
    }

    var output = JSON.parse(polc.lowlevel.compileStandard(JSON.stringify(input)));
    st.ok(bytecodeExists(output, 'cont.pol', 'x'));
    st.ok(bytecodeExists(output, 'lib.pol', 'L'));
    st.end();
  });

  t.test('invalid source code fails properly with standard JSON (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileStandard !== 'function') {
      st.skip('Low-level compileStandard interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'x.pol': {
          'content': 'contract x { this is an invalid contract }'
        }
      }
    };
    var output = JSON.parse(polc.lowlevel.compileStandard(JSON.stringify(input)));
    st.plan(3);
    st.ok('errors' in output);
    st.ok(output.errors.length >= 1);
    // Check if the ParserError exists, but allow others too
    for (var error in output.errors) {
      if (output.errors[error].type === 'ParserError') {
        st.ok(true);
      }
    }
    st.end();
  });

  t.test('compiling standard JSON (with callback) (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileStandard !== 'function') {
      st.skip('Low-level compileStandard interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'cont.pol': {
          'content': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
        }
      }
    };

    function findImports (path) {
      if (path === 'lib.pol') {
        return { contents: 'library L { function f() public returns (uint) { return 7; } }' };
      } else {
        return { error: 'File not found' };
      }
    }

    function bytecodeExists (output, fileName, contractName) {
      try {
        return output.contracts[fileName][contractName]['svm']['bytecode']['object'].length > 0;
      } catch (e) {
        return false;
      }
    }

    var output = JSON.parse(polc.lowlevel.compileStandard(JSON.stringify(input), findImports));
    st.ok(bytecodeExists(output, 'cont.pol', 'x'));
    st.ok(bytecodeExists(output, 'lib.pol', 'L'));
    st.end();
  });

  t.test('compiling standard JSON', function (st) {
    // <0.1.6 doesn't have this
    if (!polc.features.multipleInputs) {
      st.skip('Not supported by polc');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'lib.pol': {
          'content': 'library L { function f() public returns (uint) { return 7; } }'
        },
        'cont.pol': {
          'content': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
        }
      }
    };

    var output = JSON.parse(polc.compile(JSON.stringify(input)));
    var x = getBytecodeStandard(output, 'cont.pol', 'x');
    st.ok(x);
    st.ok(x.length > 0);
    var L = getBytecodeStandard(output, 'lib.pol', 'L');
    st.ok(L);
    st.ok(L.length > 0);
    st.end();
  });

  t.test('compiling standard JSON (using libraries)', function (st) {
    // <0.1.6 doesn't have this
    if (!polc.features.multipleInputs) {
      st.skip('Not supported by polc');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'libraries': {
          'lib.pol': {
            'L': '0x4200000000000000000000000000000000000001'
          }
        },
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'lib.pol': {
          'content': 'library L { function f() public returns (uint) { return 7; } }'
        },
        'cont.pol': {
          'content': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
        }
      }
    };

    var output = JSON.parse(polc.compile(JSON.stringify(input)));
    var x = getBytecodeStandard(output, 'cont.pol', 'x');
    st.ok(x);
    st.ok(x.length > 0);
    st.ok(Object.keys(linker.findLinkReferences(x)).length === 0);
    var L = getBytecodeStandard(output, 'lib.pol', 'L');
    st.ok(L);
    st.ok(L.length > 0);
    st.end();
  });

  t.test('compiling standard JSON (using libraries) (using lowlevel API)', function (st) {
    if (typeof polc.lowlevel.compileStandard !== 'function') {
      st.skip('Low-level compileStandard interface not implemented by this compiler version.');
      st.end();
      return;
    }

    var input = {
      'language': 'Polynomial',
      'settings': {
        'libraries': {
          'lib.pol': {
            'L': '0x4200000000000000000000000000000000000001'
          }
        },
        'outputSelection': {
          '*': {
            '*': [ 'svm.bytecode' ]
          }
        }
      },
      'sources': {
        'lib.pol': {
          'content': 'library L { function f() public returns (uint) { return 7; } }'
        },
        'cont.pol': {
          'content': 'import "lib.pol"; contract x { function g() public { L.f(); } }'
        }
      }
    };

    var output = JSON.parse(polc.lowlevel.compileStandard(JSON.stringify(input)));
    var x = getBytecodeStandard(output, 'cont.pol', 'x');
    st.ok(x);
    st.ok(x.length > 0);
    st.ok(Object.keys(linker.findLinkReferences(x)).length === 0);
    var L = getBytecodeStandard(output, 'lib.pol', 'L');
    st.ok(L);
    st.ok(L.length > 0);
    st.end();
  });
});

tape('Loading Legacy Versions', function (t) {
  t.test('loading remote version - development snapshot', function (st) {
    // getting the development snapshot
    st.plan(2);
    polc.loadRemoteVersion('latest', function (err, polcSnapshot) {
      if (err) {
        st.plan(1);
        st.skip('Network error - skipping remote loading test');
        st.end();
        return;
      }
      var input = {
        'language': 'Polynomial',
        'settings': {
          'outputSelection': {
            '*': {
              '*': [ 'svm.bytecode' ]
            }
          }
        },
        'sources': {
          'cont.pol': {
            'content': 'contract x { function g() public {} }'
          }
        }
      };
      var output = JSON.parse(polcSnapshot.compile(JSON.stringify(input)));
      var x = getBytecodeStandard(output, 'cont.pol', 'x');
      st.ok(x);
      st.ok(x.length > 0);
    });
  });
});

tape('API backwards compatibility', function (t) {
  t.test('compileStandard and compileStandardWrapper exists', function (st) {
    st.equal(polc.compile, polc.compileStandard);
    st.equal(polc.compile, polc.compileStandardWrapper);
    st.end();
  });
});
