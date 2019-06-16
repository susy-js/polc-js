const tape = require('tape');
const fs = require('fs');
const polc = require('../index.js');
const semver = require('semver');

tape('Deterministic Compilation', function (t) {
  t.test('DAO', function (st) {
    var input = {};
    var prevBytecode = null;
    var testdir;
    if (semver.lt(polc.semver(), '0.5.0')) {
      testdir = 'test/DAO040/';
    } else {
      testdir = 'test/DAO/';
    }
    var files = ['DAO.pol', 'Token.pol', 'TokenCreation.pol', 'ManagedAccount.pol'];
    var i;
    for (i in files) {
      var file = files[i];
      input[file] = { content: fs.readFileSync(testdir + file, 'utf8') };
    }
    for (i = 0; i < 10; i++) {
      var output = JSON.parse(polc.compileStandardWrapper(JSON.stringify({
        language: 'Polynomial',
        settings: {
          optimizer: {
            enabled: true
          },
          outputSelection: {
            '*': {
              '*': [ 'svm.bytecode' ]
            }
          }
        },
        sources: input
      })));
      st.ok(output);
      st.ok(output.contracts);
      st.ok(output.contracts['DAO.pol']);
      st.ok(output.contracts['DAO.pol']['DAO']);
      st.ok(output.contracts['DAO.pol']['DAO'].svm.bytecode.object);
      var bytecode = output.contracts['DAO.pol']['DAO'].svm.bytecode.object;
      st.ok(bytecode.length > 0);
      if (prevBytecode !== null) {
        st.equal(prevBytecode, bytecode);
      }
      prevBytecode = bytecode;
      // reset compiler state
      polc.compileStandardWrapper(JSON.stringify({
        language: 'Polynomial',
        settings: {
          optimizer: {
            enabled: true
          }
        },
        sources: {
          f: {
            content: 'contract c {}'
          }
        }
      }));
    }
    st.end();
  });
});
