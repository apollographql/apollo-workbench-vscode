import { StateManager } from '../workbench/stateManager';
import {
  StudioGraphTreeItem,
  StudioGraphVariantTreeItem,
} from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { PreloadedWorkbenchFile } from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { StudioOperationTreeItem } from '../workbench/tree-data-providers/apolloStudioGraphOpsTreeDataProvider';
import { window } from 'vscode';
import { ApolloStudioOperationsProvider } from '../workbench/docProviders';
import { getUserMemberships } from '../graphql/graphClient';
import { enterStudioApiKey } from './extension';

export function refreshStudioGraphs() {
  StateManager.instance.apolloStudioGraphsProvider.refresh();
}

export async function loadOperations(
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
  if (!StateManager.instance.globalState_userApiKey) await enterStudioApiKey();

  let accountId = '';
  let apiKey = StateManager.instance.globalState_userApiKey;

  if (apiKey) {
    const myAccountIds = await getUserMemberships(apiKey);
    const memberships = (myAccountIds?.me as any)?.memberships;
    if (memberships?.length > 1) {
      let accountMapping: { [key: string]: string } = {};
      memberships.map((membership) => {
        let accountId = membership.account.id;
        let accountName = membership.account.name;
        accountMapping[accountName] = accountId;
      });

      let selectedOrgName =
        (await window.showQuickPick(Object.keys(accountMapping), {
          placeHolder: 'Select an account to load graphs from',
        })) ?? '';
      accountId = accountMapping[selectedOrgName];
    } else {
      accountId = memberships[0]?.account?.id ?? '';
    }

    if (accountId) {
      StateManager.instance.setSelectedGraph('');
      StateManager.instance.globalState_selectedApolloAccount = accountId;
    }
  }
}
