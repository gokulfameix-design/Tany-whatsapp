/* eslint-disable @typescript-eslint/no-require-imports */
const { runVerticalTests } = require('./test-batch-flow-helpers.cjs');
runVerticalTests('ecom').catch((error) => { console.error(error); process.exitCode = 1; });
