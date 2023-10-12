import { StateManager } from '../workbench/stateManager';
import { StudioOperationTreeItem } from '../workbench/tree-data-providers/apolloStudioGraphOpsTreeDataProvider';
import { env, Uri, window } from 'vscode';
import { ApolloStudioOperationsProvider } from '../workbench/docProviders';
import { getUserMemberships } from '../graphql/graphClient';
import { enterGraphOSUserApiKey } from './extension';
import { StudioGraphTreeItem } from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { log } from 'console';

export async function openInGraphOS(item: StudioGraphTreeItem) {
  const url = `https://studio.apollographql.com/graph/${item.graphId}/home`;
  await env.openExternal(Uri.parse(url));
}

export function refreshStudioGraphs() {
  StateManager.instance.apolloStudioGraphsProvider.refresh();
}

export async function loadOperationsFromGraphOS(
  graphTreeItem: any,
  graphVariant?: string,
) {
  StateManager.instance.setSelectedGraph(graphTreeItem.graphId, graphVariant);
}

export async function viewStudioOperation(operation: StudioOperationTreeItem) {
  await window.showTextDocument(
    ApolloStudioOperationsProvider.Uri(
      operation.operationName,
      operation.operationSignature,
    ),
  );
}

export async function switchOrg() {
  if (!StateManager.instance.globalState_userApiKey)
    await enterGraphOSUserApiKey();

  let accountId = '';
  const myAccountIds = await getUserMemberships();
  const memberships = (myAccountIds?.me as any)?.memberships;
  if (memberships?.length > 1) {
    const accountMapping: { [key: string]: string } = {};
    memberships.map((membership) => {
      const accountId = membership.account.id;
      const accountName = membership.account.name;
      accountMapping[accountName] = accountId;
    });

    const selectedOrgName =
      (await window.showQuickPick(Object.keys(accountMapping), {
        placeHolder: 'Select an account to load graphs from',
      })) ?? '';
    accountId = accountMapping[selectedOrgName];
  } else if (memberships && memberships.length == 1) {
    accountId = memberships[0]?.account?.id ?? '';
  }

  if (accountId) {
    StateManager.instance.setSelectedGraph('');
    StateManager.instance.globalState_selectedApolloAccount = accountId;
  } else {
    log('Unable to get orgs');
    window.showErrorMessage(
      `Unable to get orgs. Did you delete your API key? Try logging out and then logging back in.`,
    );
  }
}
