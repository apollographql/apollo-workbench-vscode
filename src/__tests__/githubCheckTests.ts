const fetch = require('node-fetch');
import { testRunner } from './testRunner';

async function setStatus(state, description) {
  return fetch(`https://api.github.com/repos/apollographql/apollo-workbench-vscode/statuses/${process.env.GITHUB_SHA}`, {
    method: 'POST',
    body: JSON.stringify({
      state,
      description,
      context: "VSCode Extension Tests",
    }),
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

async function githubActionTests() {
  try {
    await setStatus('pending', 'Running check..'),

      await testRunner();
    await testRunner(true);

    await setStatus('success', 'Tests for workbench folder open passed');

  } catch (err) {
    await setStatus('error', err?.message ? err.message : 'Failed to run tests');
  }
}

githubActionTests();