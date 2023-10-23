import {
  getAccountGraphs,
  getUserMemberships,
} from '../../graphql/graphClient';
import { StateManager } from '../stateManager';
import {
  TreeItem,
  TreeDataProvider,
  EventEmitter,
  Event,
  window,
  commands,
} from 'vscode';
import { NotLoggedInTreeItem } from './tree-items/graphos-supergraphs/notLoggedInTreeItem';
import { SignupTreeItem } from './tree-items/graphos-supergraphs/signupTreeItem';
import { PreloadedWorkbenchTopLevel } from './tree-items/graphos-supergraphs/preloadedWorkbenchTopLevel';
import { StudioGraphVariantTreeItem } from './tree-items/graphos-supergraphs/studioGraphVariantTreeItem';
import { StudioGraphTreeItem } from './tree-items/graphos-supergraphs/studioGraphTreeItem';
import { StudioAccountTreeItem } from './tree-items/graphos-supergraphs/studioAccountTreeItem';

export class ApolloStudioGraphsTreeDataProvider
  implements TreeDataProvider<TreeItem>
{
  constructor(private workspaceRoot: string) {}

  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined> =
    new EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  async getChildren(element?: StudioAccountTreeItem): Promise<TreeItem[]> {
    if (element) return element.children;
    const items: TreeItem[] = new Array<TreeItem>();

    const apiKey = StateManager.instance.globalState_userApiKey;
    if (apiKey) {
      let accountId = StateManager.instance.globalState_selectedApolloAccount;
      if (!accountId) {
        const myAccountIds = await getUserMemberships();
        const memberships = (myAccountIds?.me as any)?.memberships;
        if (memberships?.length > 1) {
          const accountIds: string[] = new Array<string>();
          memberships.map((membership) =>
            accountIds.push(membership.account.id),
          );

          accountId =
            (await window.showQuickPick(accountIds, {
              placeHolder: 'Select an account to load graphs from',
            })) ?? '';
        } else {
          accountId = memberships[0]?.account?.id ?? '';
        }
      }

      if (accountId) {
        StateManager.instance.globalState_selectedApolloAccount = accountId;

        //Create objects for next for loop
        //  Return A specific account with all graphs

        //Change to single root query
        //  2. commands/studio-graphs/switchOrg should actually just refresh this provider to re-use this query
        // query ExampleQuery($name: String!) {
        //   frontendUrlRoot
        //   me {
        //     id
        //     ... on InternalIdentity {
        //       accounts {
        //         id
        //         name
        //         graphs {
        //           id
        //           title
        //           variant(name: $name) {
        //             name
        //           }
        //         }
        //       }
        //     }
        //   }
        // }

        const services = await getAccountGraphs(accountId);
        const accountTreeItem = new StudioAccountTreeItem(
          accountId,
          services?.organization?.name,
        );

        if (services?.organization?.graphs) {
          const accountServiceTreeItems = new Array<StudioGraphTreeItem>();

          for (let j = 0; j < services?.organization?.graphs.length ?? 0; j++) {
            //Cast graph
            const graph = services?.organization?.graphs[j];

            //Create objects for next for loop
            //  Return A specific Graph with all variants
            const graphTreeItem = new StudioGraphTreeItem(
              graph.id,
              graph.title,
            );
            const graphVariantTreeItems =
              new Array<StudioGraphVariantTreeItem>();

            //Loop through graph variants and add to return objects
            for (let k = 0; k < graph.variants.length; k++) {
              //Cast graph variant
              const graphVariant = graph.variants[k];
              graphTreeItem.variants.push(graphVariant.name);

              const accountgraphVariantTreeItem =
                new StudioGraphVariantTreeItem(graph.id, graphVariant.name);
              graphVariantTreeItems.push(accountgraphVariantTreeItem);
            }
            if (graphVariantTreeItems.length == 0)
              graphVariantTreeItems.push(
                new StudioGraphVariantTreeItem(graph.id, 'current'),
              );

            //Set the implementing service tree items on the return objects
            graphTreeItem.children = graphVariantTreeItems;
            accountServiceTreeItems.push(graphTreeItem);
          }

          accountTreeItem.children = accountServiceTreeItems;
        }
        items.push(accountTreeItem);
      }

      if (StateManager.settings_displayExampleGraphs)
        items.push(new PreloadedWorkbenchTopLevel());
    } else {
      items.push(new NotLoggedInTreeItem());
      items.push(new SignupTreeItem());
      window
        .showInformationMessage('No user api key was found.', 'Login')
        .then((response) => {
          if (response === 'Login') commands.executeCommand('extension.login');
        });
    }

    return items;
  }
}
