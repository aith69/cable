// Helper for deploy/install.sh. It uses the same validation rules as the server.
//   make-config.js KEY=VALUE ...      validate the settings and print the config.json to write
//   make-config.js --get KEY [FILE]   print the effective value of KEY (the default, or the one in FILE)
process.env.NODE_ENV = 'test'; // so that server/config.js does not read the local config.json
import { existsSync, readFileSync } from 'node:fs';
const { DEFAULTS, RULES, resolveConfig } = await import('../server/config.js');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

function readFile(path) {
  if (!path || !existsSync(path)) return {};
  try {
    const file = JSON.parse(readFileSync(path, 'utf8'));
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('expected a JSON object');
    return file;
  } catch (err) {
    return fail(`${path}: ${err.message}`);
  }
}

const args = process.argv.slice(2);

if (args[0] === '--get') {
  const [, key, path] = args;
  if (!Object.hasOwn(DEFAULTS, key)) fail(`unknown setting "${key}"`);
  const { values, errors } = resolveConfig({ file: readFile(path) });
  if (errors.length) fail(errors.join('\n'));
  const value = values[key];
  console.log(typeof value === 'object' ? JSON.stringify(value) : String(value));
} else {
  const file = {};
  const errors = [];
  for (const arg of args) {
    const at = arg.indexOf('=');
    const key = at > 0 ? arg.slice(0, at) : arg;
    const text = at > 0 ? arg.slice(at + 1).trim() : '';
    if (!Object.hasOwn(RULES, key)) {
      errors.push(`unknown setting "${key}" (valid: ${Object.keys(RULES).join(', ')})`);
      continue;
    }
    if (text === '') continue;
    const value = RULES[key].parse(text);
    const problem = RULES[key].check(value);
    if (problem) errors.push(`${key}: ${problem}`);
    else file[key] = value;
  }
  if (errors.length) fail(errors.join('\n'));
  const { errors: invalid, warnings } = resolveConfig({ file });
  if (invalid.length) fail(invalid.join('\n'));
  for (const warning of warnings) console.error(`Warning: ${warning}`);
  console.log(JSON.stringify(file, null, 2));
}
