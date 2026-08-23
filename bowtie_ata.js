const readline = require("readline");
const os = require("os");
const process = require("process");

const { Validator } = require("ata-validator");
const ata_version = require("ata-validator/package.json").version;

const stdio = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(data) {
  console.log(JSON.stringify(data));
}

var started = false;

const DEFAULT_DIALECT = "https://json-schema.org/draft/2020-12/schema";
var dialect = DEFAULT_DIALECT;

// ata selects its draft from the schema's own $schema keyword, while Bowtie
// announces the dialect out of band. Stamp the announced dialect onto schemas
// that do not carry one, so draft-07 cases are validated as draft-07 rather
// than falling back to 2020-12 semantics.
function withDialect(schema) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }
  return "$schema" in schema ? schema : { ...schema, $schema: dialect };
}

const cmds = {
  start: (args) => {
    console.assert(args.version === 1, { args });
    started = true;
    return {
      version: 1,
      implementation: {
        language: "javascript",
        name: "ata-validator",
        version: ata_version,
        homepage: "https://github.com/ata-core/ata-validator",
        documentation: "https://github.com/ata-core/ata-validator",
        issues: "https://github.com/ata-core/ata-validator/issues",
        source: "https://github.com/ata-core/ata-validator",
        dialects: [
          "https://json-schema.org/draft/2020-12/schema",
          "http://json-schema.org/draft-07/schema#",
        ],
        os: os.platform(),
        os_version: os.release(),
        language_version: process.version,
      },
    };
  },

  dialect: (args) => {
    console.assert(started, "Not started!");
    dialect = args.dialect;
    return { ok: true };
  },

  run: (args) => {
    console.assert(started, "Not started!");

    const testCase = args.case;

    try {
      const schemas = [];
      for (const id in testCase.registry) {
        schemas.push(withDialect({ ...testCase.registry[id], $id: id }));
      }

      const v = new Validator(withDialect(testCase.schema), {
        schemas: schemas.length > 0 ? schemas : undefined,
        // ata asserts formats and applies defaults by default, which suits the
        // web frameworks it targets. The suite expects the specification
        // reading: format is an annotation, and default never affects whether
        // an instance is valid.
        assertFormat: false,
        useDefaults: false,
      });

      const results = testCase.tests.map((test) => {
        try {
          return { valid: v.validate(test.instance).valid };
        } catch (error) {
          return {
            errored: true,
            context: {
              traceback: error.stack,
              message: error.message,
            },
          };
        }
      });

      return { seq: args.seq, results: results };
    } catch (error) {
      return {
        errored: true,
        seq: args.seq,
        context: {
          traceback: error.stack,
          message: error.message,
        },
      };
    }
  },

  stop: (_) => {
    console.assert(started, "Not started!");
    process.exit(0);
  },
};

stdio.on("line", (line) => {
  const request = JSON.parse(line);
  const response = cmds[request.cmd](request);
  send(response);
});
