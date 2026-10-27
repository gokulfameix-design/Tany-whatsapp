/* eslint-disable @typescript-eslint/no-require-imports */
const { runVerticalTests } = require('./test-batch-flow-helpers.cjs');
runVerticalTests('cabs').catch((error) => { console.error(error); process.exitCode = 1; });
