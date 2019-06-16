var assert = require('assert');
var translate = require('./translate.js');
var requireFromString = require('require-from-string');
var https = require('https');
var MemoryStream = require('memorystream');

function setupMethods (poljson) {
  var copyString = function (str, ptr) {
    var length = poljson.lengthBytesUTF8(str);
    var buffer = poljson._malloc(length + 1);
    poljson.stringToUTF8(str, buffer, length + 1);
    poljson.setValue(ptr, buffer, '*');
  };

  var wrapCallback = function (callback) {
    assert(typeof callback === 'function', 'Invalid callback specified.');
    return function (path, contents, error) {
      var result = callback(poljson.Pointer_stringify(path));
      if (typeof result.contents === 'string') {
        copyString(result.contents, contents);
      }
      if (typeof result.error === 'string') {
        copyString(result.error, error);
      }
    };
  };

  // This calls compile() with args || cb
  var runWithReadCallback = function (readCallback, compile, args) {
    if (readCallback === undefined) {
      readCallback = function (path) {
        return {
          error: 'File import callback not supported'
        };
      };
    }

    // This is to support multiple versions of Emscripten.
    var addFunction = poljson.addFunction || poljson.Runtime.addFunction;
    var removeFunction = poljson.removeFunction || poljson.Runtime.removeFunction;

    var cb = addFunction(wrapCallback(readCallback));
    var output;
    try {
      args.push(cb);
      output = compile.apply(undefined, args);
    } catch (e) {
      removeFunction(cb);
      throw e;
    }
    removeFunction(cb);
    return output;
  };

  var compileJSON = null;
  if ('_compileJSON' in poljson) {
    compileJSON = poljson.cwrap('compileJSON', 'string', ['string', 'number']);
  }

  var compileJSONMulti = null;
  if ('_compileJSONMulti' in poljson) {
    compileJSONMulti = poljson.cwrap('compileJSONMulti', 'string', ['string', 'number']);
  }

  var compileJSONCallback = null;
  if ('_compileJSONCallback' in poljson) {
    var compileInternal = poljson.cwrap('compileJSONCallback', 'string', ['string', 'number', 'number']);
    compileJSONCallback = function (input, optimize, readCallback) {
      return runWithReadCallback(readCallback, compileInternal, [ input, optimize ]);
    };
  }

  var compileStandard = null;
  if ('_compileStandard' in poljson) {
    var compileStandardInternal = poljson.cwrap('compileStandard', 'string', ['string', 'number']);
    compileStandard = function (input, readCallback) {
      return runWithReadCallback(readCallback, compileStandardInternal, [ input ]);
    };
  }
  if ('_polynomial_compile' in poljson) {
    var polynomialCompile = poljson.cwrap('polynomial_compile', 'string', ['string', 'number']);
    compileStandard = function (input, readCallback) {
      return runWithReadCallback(readCallback, polynomialCompile, [ input ]);
    };
  }

  // Expects a Standard JSON I/O but supports old compilers
  var compileStandardWrapper = function (input, readCallback) {
    if (compileStandard !== null) {
      return compileStandard(input, readCallback);
    }

    function formatFatalError (message) {
      return JSON.stringify({
        errors: [
          {
            'type': 'POLCError',
            'component': 'polcjs',
            'severity': 'error',
            'message': message,
            'formattedMessage': 'Error: ' + message
          }
        ]
      });
    }

    if (readCallback !== undefined && typeof readCallback !== 'function') {
      return formatFatalError('Invalid import callback supplied');
    }

    try {
      input = JSON.parse(input);
    } catch (e) {
      return formatFatalError('Invalid JSON supplied: ' + e.message);
    }

    if (input['language'] !== 'Polynomial') {
      return formatFatalError('Only Polynomial sources are supported');
    }

    // NOTE: this is deliberately `== null`
    if (input['sources'] == null || input['sources'].length === 0) {
      return formatFatalError('No input specified');
    }

    // Bail out early
    if ((input['sources'].length > 1) && (compileJSONMulti === null)) {
      return formatFatalError('Multiple sources provided, but compiler only supports single input');
    }

    function isOptimizerEnabled (input) {
      return input['settings'] && input['settings']['optimizer'] && input['settings']['optimizer']['enabled'];
    }

    function translateSources (input) {
      var sources = {};
      for (var source in input['sources']) {
        if (input['sources'][source]['content'] !== null) {
          sources[source] = input['sources'][source]['content'];
        } else {
          // force failure
          return null;
        }
      }
      return sources;
    }

    function librariesSupplied (input) {
      if (input['settings'] !== null) {
        return input['settings']['libraries'];
      }
    }

    function translateOutput (output, libraries) {
      try {
        output = JSON.parse(output);
      } catch (e) {
        return formatFatalError('Compiler returned invalid JSON: ' + e.message);
      }
      output = translate.translateJsonCompilerOutput(output, libraries);
      if (output == null) {
        return formatFatalError('Failed to process output');
      }
      return JSON.stringify(output);
    }

    var sources = translateSources(input);
    if (sources === null || Object.keys(sources).length === 0) {
      return formatFatalError('Failed to process sources');
    }

    // Try linking if libraries were supplied
    var libraries = librariesSupplied(input);

    // Try to wrap around old versions
    if (compileJSONCallback !== null) {
      return translateOutput(compileJSONCallback(JSON.stringify({ 'sources': sources }), isOptimizerEnabled(input), readCallback), libraries);
    }

    if (compileJSONMulti !== null) {
      return translateOutput(compileJSONMulti(JSON.stringify({ 'sources': sources }), isOptimizerEnabled(input)), libraries);
    }

    // Try our luck with an ancient compiler
    if (compileJSON !== null) {
      return translateOutput(compileJSON(sources[Object.keys(sources)[0]], isOptimizerEnabled(input)), libraries);
    }

    return formatFatalError('Compiler does not support any known interface.');
  };

  var version;
  if ('_polynomial_version' in poljson) {
    version = poljson.cwrap('polynomial_version', 'string', []);
  } else {
    version = poljson.cwrap('version', 'string', []);
  }

  var versionToSemver = function () {
    return translate.versionToSemver(version());
  };

  var license;
  if ('_polynomial_license' in poljson) {
    license = poljson.cwrap('polynomial_license', 'string', []);
  } else if ('_license' in poljson) {
    license = poljson.cwrap('license', 'string', []);
  } else {
    // pre 0.4.14
    license = function () {
      // return undefined
    };
  }

  return {
    version: version,
    semver: versionToSemver,
    license: license,
    lowlevel: {
      compileSingle: compileJSON,
      compileMulti: compileJSONMulti,
      compileCallback: compileJSONCallback,
      compileStandard: compileStandard
    },
    features: {
      legacySingleInput: compileJSON !== null,
      multipleInputs: compileJSONMulti !== null || compileStandard !== null,
      importCallback: compileJSONCallback !== null || compileStandard !== null,
      nativeStandardJSON: compileStandard !== null
    },
    compile: compileStandardWrapper,
    // Temporary wrappers to minimise breaking with other projects.
    // NOTE: to be removed in 0.5.2
    compileStandard: compileStandardWrapper,
    compileStandardWrapper: compileStandardWrapper,
    // Loads the compiler of the given version from the github repository
    // instead of from the local filesystem.
    loadRemoteVersion: function (versionString, cb) {
      var mem = new MemoryStream(null, {readable: false});
      var url = 'https://sophon.github.io/polc-bin/bin/poljson-' + versionString + '.js';
      https.get(url, function (response) {
        if (response.statusCode !== 200) {
          cb(new Error('Error retrieving binary: ' + response.statusMessage));
        } else {
          response.pipe(mem);
          response.on('end', function () {
            cb(null, setupMethods(requireFromString(mem.toString(), 'poljson-' + versionString + '.js')));
          });
        }
      }).on('error', function (error) {
        cb(error);
      });
    },
    // Use this if you want to add wrapper functions around the pure module.
    setupMethods: setupMethods
  };
}

module.exports = setupMethods;
