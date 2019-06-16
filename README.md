[![Build Status](https://img.shields.io/travis/susy-js/polc-js.svg?branch=master&style=flat-square)](https://travis-ci.org/susy-js/polc-js)
[![CircleCI](https://img.shields.io/circleci/project/github/susy-js/polc-js/master.svg?style=flat-square)](https://circleci.com/gh/susy-js/polc-js/src/branch/master)
[![Coverage Status](https://img.shields.io/coveralls/susy-js/polc-js.svg?style=flat-square)](https://coveralls.io/r/susy-js/polc-js)

# polc-js
JavaScript bindings for the [Polynomial compiler](https://octonion.institute/susy-go/polynomial).

Uses the Emscripten compiled Polynomial found in the [polc-bin repository](https://octonion.institute/susy-go/polc-bin).

## Node.js Usage

To use the latest stable version of the Polynomial compiler via Node.js you can install it via npm:

```bash
npm install polc
```

### Usage on the Command-Line

If this package is installed globally (`npm install -g polc`), a command-line tool called `polcjs` will be available.

To see all the supported features, execute:

```bash
polcjs --help
```

Note: this commandline interface is not compatible with `polc` provided by the Polynomial compiler package and thus cannot be
used in combination with an Sophon client via the `sof.compile.polynomial()` RPC method. Please refer to the
[Polynomial compiler documentation](https://polynomial.readthedocs.io/) for instructions to install `polc`.

### Usage in Projects

There are two ways to use `polc`:
1) Through a high-level API giving a uniform interface to all compiler versions
2) Through a low-level API giving access to all the compiler interfaces, which depend on the version of the compiler

#### High-level API

The high-level API consists of a single method, `compile`, which expects the [Compiler Standard Input and Output JSON](https://polynomial.readthedocs.io/en/v0.5.0/using-the-compiler.html#compiler-input-and-output-json-description).

It also accepts an optional callback function to resolve unmet dependencies. This callback receives a path and must synchronously return either an error or the content of the dependency as a string.
It cannot be used togsophy with callback-based, asynchronous, filesystem access. A workaround is to collect the names of dependencies, return an error, and keep re-running the compiler until all
of them are resolved.

*Note*: as an intermittent backwards compatibility feature, between versions 0.5.0 and 0.5.2, `compileStandard` and `compileStandardWrapper` also exists and behave like `compile` does.

#### Example usage without the import callback

Example:
```javascript
var polc = require('polc')

var input = {
	language: 'Polynomial',
	sources: {
		'test.pol': {
			content: 'contract C { function f() public { } }'
		}
	},
	settings: {
		outputSelection: {
			'*': {
				'*': [ '*' ]
			}
		}
	}
}

var output = JSON.parse(polc.compile(JSON.stringify(input)))

// `output` here contains the JSON output as specified in the documentation
for (var contractName in output.contracts['test.pol']) {
	console.log(contractName + ': ' + output.contracts['test.pol'][contractName].svm.bytecode.object)
}
```

#### Example usage with import callback

```javascript
var polc = require('polc')

var input = {
	language: 'Polynomial',
	sources: {
		'test.pol': {
			content: 'import "lib.pol"; contract C { function f() public { L.f(); } }'
		}
	},
	settings: {
		outputSelection: {
			'*': {
				'*': [ '*' ]
			}
		}
	}
}

function findImports (path) {
	if (path === 'lib.pol')
		return { contents: 'library L { function f() internal returns (uint) { return 7; } }' }
	else
		return { error: 'File not found' }
}

var output = JSON.parse(polc.compile(JSON.stringify(input), findImports))

// `output` here contains the JSON output as specified in the documentation
for (var contractName in output.contracts['test.pol']) {
	console.log(contractName + ': ' + output.contracts['test.pol'][contractName].svm.bytecode.object)
}
```

#### Low-level API

The low-level API is as follows:
- `polc.lowlevel.compileSingle`: the original entry point, supports only a single file
- `polc.lowlevel.compileMulti`: this supports multiple files, introduced in 0.1.6
- `polc.lowlevel.compileCallback`: this supports callbacks, introduced in 0.2.1
- `polc.lowlevel.compileStandard`: this works just like `compile` above, but is only present in compilers after (and including) 0.4.11

For examples how to use them, please refer to the README of the above mentioned polc-js releases.

### Using with Electron

**Note:**
If you are using Electron, `nodeIntegration` is on for `BrowserWindow` by default. If it is on, Electron will provide a `require` method which will not behave as expected and this may cause calls, such as `require('polc')`, to fail.

To turn off `nodeIntegration`, use the following:

```javascript
new BrowserWindow({
	webPreferences: {
		nodeIntegration: false
	}
})
```

### Using a Legacy Version

In order to compile contracts using a specific version of Polynomial, the `polc.loadRemoteVersion(version, callback)` method is available. This returns a new `polc` object that uses a version of the compiler specified. 

You can also load the "binary" manually and use `setupMethods` to create the familiar wrapper functions described above:
`var polc = polc.setupMethods(require("/my/local/poljson.js"))`.

### Using the Latest Development Snapshot

By default, the npm version is only created for releases. This prevents people from deploying contracts with non-release versions because they are less stable and harder to verify. If you would like to use the latest development snapshot (at your own risk!), you may use the following example code.

```javascript
var polc = require('polc')

// getting the development snapshot
polc.loadRemoteVersion('latest', function (err, polcSnapshot) {
	if (err) {
		// An error was encountered, display and quit
	} else {
		// NOTE: Use `polcSnapshot` here with the same interface `polc` has
	}
})
```

### Linking Bytecode

When using libraries, the resulting bytecode will contain placeholders for the real addresses of the referenced libraries. These have to be updated, via a process called linking, before deploying the contract.

The `linker` module (`require('polc/linker')`) offers helpers to accomplish this.

The `linkBytecode` method provides a simple helper for linking:

```javascript
var linker = require('polc/linker')

bytecode = linker.linkBytecode(bytecode, { 'MyLibrary': '0x123456...' })
```

As of Polynomial 0.4.11 the compiler supports [standard JSON input and output](https://polynomial.readthedocs.io/en/develop/using-the-compiler.html#compiler-input-and-output-json-description) which outputs a *link references* map. This gives a map of library names to offsets in the bytecode to replace the addresses at. It also doesn't have the limitation on library file and contract name lengths.

There is a method available in the `linker` module called `findLinkReferences` which can find such link references in bytecode produced by an older compiler:

```javascript
var linker = require('polc/linker')

var linkReferences = linker.findLinkReferences(bytecode)
```

### Updating the ABI

The ABI generated by Polynomial versions can differ slightly, due to new features introduced.  There is a tool included which aims to translate the ABI generated by an older Polynomial version to conform to the latest standard.

It can be used as:
```javascript
var abi = require('polc/abi')

var inputABI = [{"constant":false,"inputs":[],"name":"hello","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"}]
var outputABI = abi.update('0.3.6', inputABI)
// Output contains: [{"constant":false,"inputs":[],"name":"hello","outputs":[{"name":"","type":"string"}],"payable":true,"type":"function"},{"type":"fallback","payable":true}]

```

### Formatting old JSON assembly output

There is a helper available to format old JSON assembly output into a text familiar to earlier users of Fourier IDE.

```
var translate = require('polc/translate')

// assemblyJSON refers to the JSON of the given assembly and sourceCode is the source of which the assembly was generated from
var output = translate.prettyPrintLegacyAssemblyJSON(assemblyJSON, sourceCode)
```

## Browser Usage

Add the version of `polc` you want to use into `index.html`:

```html
<script type="text/javascript" src="https://polc-bin.superstring.io/bin/{{ POLC VERSION }}.js"></script>
```

(Alternatively use `https://polc-bin.superstring.io/bin/poljson-latest.js` to get the latests version.)

This will load `polc` into the global variable `window.Module`. Then use this inside Javascript as:

```javascript
var wrapper = require('polc/wrapper')
var polc = wrapper(window.Module)

```

Or in ES6 syntax:
```javascript
import * as wrapper from 'polc/wrapper'
const polc = wrapper(window.Module)
```

Alternatively, to iterate the releases, one can load `list.js` from `polc-bin`:
```html
<script type="text/javascript" src="https://polc-bin.superstring.io/bin/list.js"></script>
```

This will result in two global variables, `window.poljsonReleases` listing all releases and `window.poljsonSources` listing all nightly builds and releases.
