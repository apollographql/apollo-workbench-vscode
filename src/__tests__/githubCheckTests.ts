const cp = require('child_process');
const fetch = require('node-fetch');
import { testRunner } from './testRunner';

async function setStatus(context, state, description) {
  return fetch(`https://api.github.com/repos/apollographql/apollo-workbench-vscode/statuses/${process.env.GITHUB_SHA}`, {
    method: 'POST',
    body: JSON.stringify({
      state,
      description,
      context,
    }),
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

async function githubActionTests() {
  try {

    //Set status of PR
    await Promise.all([
      await setStatus('No Folder Open Tests', 'pending', 'Running check..'),
      await setStatus('Folder Open Tests', 'pending', 'Running check..')
    ]);

    //Run tests in parallel
    await Promise.all([
      new Promise(async () => {
        try {
          await testRunner();
          await setStatus("No Folder Open Tests", 'success', 'Tests for no workbench folder open passed');
        } catch (err) {
          await setStatus("No Folder Open Tests", 'failure', err?.message ? err.message : 'Tests for no workbench folder open failed');
        }
      }),
      new Promise(async () => {
        try {
          await testRunner(true);
          await setStatus("Folder Open Tests", 'success', 'Tests for workbench folder open passed');
        } catch (err) {
          await setStatus("Folder Open Tests", 'failure', err?.message ? err.message : 'Tests for workbench folder open failed');
        }
      })
    ]);

  } catch (err) {
    const message = err?.message ? err.message : 'Failed to run tests';
    console.error(message);

    await setStatus("No Folder Open Tests", 'error', message);
    await setStatus("Folder Open Tests", 'error', message);
  }
}

githubActionTests();