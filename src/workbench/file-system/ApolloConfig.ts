export class ApolloConfig {
  federation_version?: string;
  subgraphs: { [name: string]: Subgraph } = {};
  operations: { [name: string]: Operation } = {};

  constructor() {
    this.federation_version = '=2.5.2';
  }

  public static copy(config: ApolloConfig) {
    const newConfig = new ApolloConfig();
    newConfig.federation_version = config.federation_version;
    newConfig.subgraphs = config.subgraphs;

    return newConfig;
  }
}

export type Subgraph = {
  routing_url?: string;
  schema: Schema;
};

type Schema = {
  file?: string;
  graphref?: string;
  subgraph?: string;
  subgraph_url?: string;

  workbench_design?: string;
  mocks?: MockSubgraph;
};

type MockSubgraph = {
  enabled: boolean;
  customMocks?: string;
};

export type Operation = {
  document: string;
  ui_design?: string;
};
