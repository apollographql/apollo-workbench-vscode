import { GraphQLSchema } from 'graphql';
import { ExtensionContext, workspace } from 'vscode';
import { Entity, FieldWithType } from './federationCompletionProvider';
import { ApolloStudioGraphsTreeDataProvider } from './tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { ApolloStudioGraphOpsTreeDataProvider } from './tree-data-providers/apolloStudioGraphOpsTreeDataProvider';
import { LocalSupergraphTreeDataProvider } from './tree-data-providers/superGraphTreeDataProvider';

export class StateManager {
  context: ExtensionContext;

  private static _instance: StateManager;
  static get instance(): StateManager {
    if (!this._instance)
      throw new Error('You must call init() before using the state manager');

    return this._instance;
  }
  constructor(context: ExtensionContext) {
    this.context = context;
  }

  static init(context: ExtensionContext) {
    this._instance = new StateManager(context);
  }

  apolloStudioGraphsProvider: ApolloStudioGraphsTreeDataProvider =
    new ApolloStudioGraphsTreeDataProvider(workspace.rootPath ?? '.');
  apolloStudioGraphOpsProvider: ApolloStudioGraphOpsTreeDataProvider =
    new ApolloStudioGraphOpsTreeDataProvider();
  localSupergraphTreeDataProvider: LocalSupergraphTreeDataProvider =
    new LocalSupergraphTreeDataProvider();

  get extensionGlobalStoragePath(): string {
    try {
      //Running version 1.49+
      return this.context.globalStorageUri.fsPath;
    } catch (err) {
      //Running version 1.48 or lower
      return this.context.globalStoragePath;
    }
  }

  static get workspaceRoot(): string | undefined {
    return workspace.workspaceFolders
      ? workspace.workspaceFolders[0]?.uri?.fsPath
      : undefined;
  }
  static get settings_startingServerPort(): number {
    return (
      workspace
        ?.getConfiguration('apollo-workbench')
        ?.get('startingServerPort') ?? (4000 as number)
    );
  }
  static get settings_openSandbox(): boolean {
    return (
      workspace
        ?.getConfiguration('apollo-workbench')
        ?.get('openSandboxOnStartMocks') ?? true
    );
  }
  static get settings_gatewayServerPort(): number {
    return (
      workspace?.getConfiguration('apollo-workbench')?.get('gatewayPort') ??
      (4001 as number)
    );
  }
  static get settings_apiKey() {
    return (
      (workspace
        .getConfiguration('apollo-workbench')
        .get('graphApiKey') as string) ??
      process.env.APOLLO_KEY ??
      ''
    );
  }
  static get settings_graphVariant() {
    return (
      (workspace
        .getConfiguration('apollo-workbench')
        .get('graphVariant') as string) ??
      process.env.APOLLO_GRAPH_VARIANT ??
      ''
    );
  }
  static get settings_daysOfOperationsToFetch(): number {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('daysOfOperationsToFetch') as number;
  }
  static get settings_gatewayReCompositionInterval() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('gatewayReCompositionInterval') as number;
  }
  static get settings_displayGettingStarted() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('displayGettingStarted') as boolean;
  }
  static get settings_displayExampleGraphs() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('displayExampleGraphs') as boolean;
  }
  static get settings_tlsRejectUnauthorized() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('tlsRejectUnauthorized') as boolean;
  }
  static get settings_headersToForwardFromGateway() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('headersToForwardFromGateway') as Array<string>;
  }
  static get settings_apolloOrg() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('apolloOrg') as string;
  }
  static get settings_localDesigns_expandSubgraphsByDefault() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('local-designs.expandSubgraphsByDefault') as boolean;
  }
  static get settings_localDesigns_expandOperationsByDefault() {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('local-designs.expandOperationsByDefault') as boolean;
  }
  static get settings_roverConfigProfile(): string {
    return workspace
      .getConfiguration('apollo-workbench')
      .get('roverConfigProfile') as string;
  }
  static set settings_roverConfigProfile(profile: string) {
    workspace
      .getConfiguration('apollo-workbench')
      .update('roverConfigProfile', profile);
  }
  // get globalState_roverConfigProfile(): string {
  //   return this.context?.globalState.get('roverConfigProfile') as string;
  // }
  // set globalState_roverConfigProfile(profile: string) {
  //   this.context?.globalState.update('roverConfigProfile', profile);
  // }
  get globalState_userApiKey() {
    return this.context?.globalState.get('APOLLO_KEY') as string;
  }
  set globalState_userApiKey(apiKey: string) {
    this.context?.globalState.update('APOLLO_KEY', apiKey);

    if (!apiKey) this.globalState_selectedApolloAccount = '';

    this.apolloStudioGraphsProvider.refresh();
    this.apolloStudioGraphOpsProvider.refresh();
  }
  get globalState_selectedApolloAccount() {
    if (StateManager.settings_apolloOrg) return StateManager.settings_apolloOrg;
    return this.context?.globalState.get('APOLLO_SELCTED_ACCOUNT') as string;
  }
  set globalState_selectedApolloAccount(accountId: string) {
    this.context?.globalState.update('APOLLO_SELCTED_ACCOUNT', accountId);
  }
  setSelectedGraph(graphId: string, variant?: string) {
    this.context?.globalState.update('APOLLO_SELCTED_GRAPH_ID', graphId);
    this.context?.globalState.update('APOLLO_SELCTED_GRAPH_VARIANT', variant);

    this.apolloStudioGraphOpsProvider.refresh();
  }
  get globalState_selectedGraphVariant() {
    return this.context?.globalState.get(
      'APOLLO_SELCTED_GRAPH_VARIANT',
    ) as string;
  }
  get globalState_selectedGraph() {
    return this.context?.globalState.get('APOLLO_SELCTED_GRAPH_ID') as string;
  }
  // set globalState_selectedGraph(graphId: string) {
  //     this.context?.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphId);

  //     this.apolloStudioGraphOpsProvider.refresh();
  // }
  get workspaceState_availableEntities() {
    return this.context?.workspaceState.get('availableEntities') as {
      [wbFilePath: string]: {
        [serviceName: string]: Entity[];
      };
    };
  }
  workspaceState_clearEntities() {
    this.context?.workspaceState.update('availableEntities', {});
  }
  workspaceState_setEntities(input: {
    designPath: string;
    entities: {
      [serviceName: string]: Entity[];
    };
  }) {
    const savedEntities = this.workspaceState_availableEntities ?? {};
    savedEntities[input.designPath] = input.entities;
    this.context?.workspaceState.update('availableEntities', savedEntities);
  }
  get workspaceState_selectedWorkbenchAvailableEntities() {
    return this.context?.workspaceState.get(
      'selectedWorkbenchAvailableEntities',
    ) as {
      [serviceName: string]: {
        type: string;
        keys: { [key: string]: FieldWithType[] };
      }[];
    };
  }
  set workspaceState_selectedWorkbenchAvailableEntities(entities: {
    [serviceName: string]: {
      type: string;
      keys: { [key: string]: FieldWithType[] };
    }[];
  }) {
    this.context?.workspaceState.update(
      'selectedWorkbenchAvailableEntities',
      entities,
    );
  }
  clearWorkspaceSchema() {
    this.context?.workspaceState.update('schema', undefined);
  }
  get workspaceState_schema() {
    return this.context?.workspaceState.get('schema') as GraphQLSchema;
  }
  set workspaceState_schema(schema: GraphQLSchema) {
    this.context?.workspaceState.update('schema', schema);
  }
}
