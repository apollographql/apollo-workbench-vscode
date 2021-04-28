// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('node-fetch');
import { testRunner } from './testRunner';

async function setStatus(state, description) {
  return fetch(
    `https://api.github.com/repos/apollographql/apollo-workbench-vscode/statuses/${process.env.GITHUB_SHA}`,
    {
      method: 'POST',
      body: JSON.stringify({
        state,
        description,
        context: 'VSCode Extension Tests',
      }),
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  );
}

async function githubActionTests() {
  try {
    await setStatus('pending', 'Running check..');
    console.log('Set Status successfully');
    let result = 1;

    console.log('Running tests with no folder loaded');
    result = await testRunner();
    console.log('Running tests with folder loaded');
    result = await testRunner(true);

    await setStatus('success', 'Tests for workbench folder open passed');
    process.exit(result);
  } catch (err) {
    console.log(
      err?.message
        ? `Failed to run tests: ${err.message}`
        : `Failed to run tests: ${err}`,
    );
    await setStatus(
      'error',
      err?.message ? err.message : `Failed to run tests: ${err}`,
    );
    process.exit(1);
  }
}

githubActionTests();
