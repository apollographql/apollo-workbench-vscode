export class ApolloConfig {
  federation_version?: string;
  subgraphs: { [name: string]: Subgraph } = {};
  composition_result? = false;

  constructor() {
    this.federation_version = '2';
  }
}

export type Subgraph = {
  name: string;
  routing_url: string;
  schema: Schema;
};

type Schema = {
  file: string;
  graphref: string;
  subgraph: string;
  subgraph_url: string;

  workbench_design: string;
};
