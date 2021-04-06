# Apollo Solutions Tooling - Workbench for VS Code

Workbench is a tool built by the Apollo Solutions Team to help design schemas using Apollo Federation and work with the composed results. This need was driven by working countless number of migrations from an existing GraphQL infrastructure (monolith or schema stitched) to an [Apollo Federated architecture](https://www.apollographql.com/docs/federation/).

Head over to the [docs](https://apollographql.github.io/apollo-workbench-vscode/) to learn how you can use this tool.

## Getting Started

### Setup

- [Install VS Code](https://code.visualstudio.com/download)
- [Install Apollo GraphQL VS Code Extension](https://marketplace.visualstudio.com/items?itemName=apollographql.vscode-apollo)
  - This is part of what makes intellisense work for writing schemas and queries
- Download the latest [Apollo Workbench Release](https://marketplace.visualstudio.com/items?itemName=apollographql.apollo-workbench)
  - You can view past releases [here](https://github.com/apollographql/apollo-workbench-vscode/releases)

### Logging in

1. Open VS Code with any folder (a dialog will display if you don't have a folder open)

2. Go to your [personal settings in Apollo Studio](https://studio.apollographql.com/user-settings) and copy your user api key. Paste your api key into the extension (which will be saved to your VS Code global state)

![Enter Apollo User API Key](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-api-key.png)

### Supported Workflows

- [Design a New Supergraph](./new-supergraph.md)
- [Migrating from Monolith to a New Supergraph](./migration-monolith-to-supergraph.md)
- [Designing a change to an existing graph in Apollo Studio](./apollo-studio-supergraph-designs)

## What is Apollo Workbench for VS Code?

To get the most out of GraphQL, your organization should expose a single data graph that provides a unified interface for querying any combination of your backing data sources. However, it can be challenging to represent an enterprise-scale data graph with a single, monolithic GraphQL server. Apollo Federation enables you to divide your graph's implementation across multiple composable services and Workbench is the tool to help you design that out with only schema files.

The Apollo Workbench extension for VS Code brings an all-in-one tooling experience for developing federated graphs.

## Features
- Creating and working with `.apollo-workbench` files
- Mocking `.apollo-workbench` files
  - Supports remote URLs for any defined service
- Providing composition errors in **Problems** panel within VS Code
- Create and edit GraphQL operations for a loaded `.apollo-workbench` file
- With a fully composed graph, view generated query plans for defined GraphQL operations
- **Apollo Studio Integration**
  - Create a `.apollo-workbench` file from a graph that has been pushed into the schema registry (i.e. `apollo service:push`)
  - Load GraphQL operations from a graph and add them to the loaded `.apollo-workbench` file.
### Mocking `.apollo-workbench` files

Apollo Workbench VS Code contains all the internals needed to mock the schemas you design out. After selecting a file in the **Local Workbench Files** tree view, each schema file in the `apollo-workbench` file can be mocked.

![Starting Mocks](https://storage.googleapis.com/apollo-workbench-vscode/workbench-start-mocks.png)

You may need to set specific headers that should be sent to the downstream services and you can set those by clicking on the settings "gear" icon for a service:
![Set Required Headers](https://storage.googleapis.com/apollo-workbench-vscode/workbench-set-required-headers.png)

The gateway will recompose every 10 seconds (you can change this in the VS Code settings under `apollo-workbench.gatewayReCompositionInterval` - note this setting is in milliseconds). You can also stop the mocks at anytime:

![Stopping Mocks](https://storage.googleapis.com/apollo-workbench-vscode/workbench-stop-mocks.png)

You can also set custom mocks per a service! Workbench currently only supports standard node packages and [faker.js](https://github.com/marak/Faker.js/). If you want to see an example of a setup service, make a copy of the `acephei-e-commerce` example graph after logging into Apollo Studio.

![Custom Mocks](https://storage.googleapis.com/apollo-workbench-vscode/workbench-custom-mocks.png)

### Composition Errors in the Problems Panel

Composition errors in your designed schema will be written to the **Problems** panel in VS Code:

![Composition Errors](https://storage.googleapis.com/apollo-workbench-vscode/workbench-composition-errors.png)

_Note: Since this is the beta release, some of the composition error pointers might be broken - like having the wrong range selected. All `workbench.graphql` errors won't point at the correct file as the proper `serviceName` needs to be identified. The error message should provide the details of what needs to be done. Stay tuned for more fixes in this area_

### Writing GraphQL Operations in workbench

If you have a valid fully composed schema, you should get intellisense when writing your queries with feedback in the Problems panel.

![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-first-operation.png)

### Loading GraphQL operaitons from Apollo Studio into workbench

You can load all of the operaitons for a given graph into the **Apollo Studio Graph Operations** tree view by clicking on a graph in the **Apollo Studio Graphs**:

![Loading Operations](https://storage.googleapis.com/apollo-workbench-vscode/workbench-loading-operations.gif)

You may see some operations that have the same name, but different `id`'s next to them. This means the operations had different signatures and are different shapes. To load any operation into the current selected workbench, either right click the operation or press the plus button on the row:

![Add Operation from Studio](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-operation-from-studio.png)

### View query plan for an operation

Everytime you make a change to any operation in the current loaded workbench will try generating a new query plan for it. If you have a graph with composition errors, you'll need to resolve those composition errors before you can view the query plan of the given operatiion. To view the query plan, either right click the operation and select **Open Query Plan** or click the query plan icon in the row:

![View Query Plan](https://storage.googleapis.com/apollo-workbench-vscode/workbench-view-query-plan.png)

## The Apollo Solutions Team

The Apollo Solutions Team is considered Apollo's first customer. We work with our customers on their graph implementations and every organization has unique challenges (along with a lot of [common ones](https://www.apollographql.com/guide)). When these challenges surface, we sometimes build some tooling or example to solve that unique challenge. This could incorporate many elements of the various Apollo OSS libraries. If you're interested in learning more about the Apollo Solutions Team and an Enterprise relationship with Apollo, please [reach out through our website](https://www.apollographql.com/contact-sales).

## What can you expect from this repo/tool?

This is a tool that is maintained by the Apollo Solutions Team, it is not a supported piece of the Apollo Platform (you can't open a Zendesk ticket for something wrong with this tool). Workbench is built on top of the Apollo OSS libraries and is an example of the type of tooling that is possible due to the declarative nature of Apollo Federation.

If you have any issues, feel free to open an issue or PR and we'll try to evolve the tool to support designing a federated schema. There have been multiple additions to support mocking scenarios and we're very interested in hearing any ideas that might help with schema design.


## Troubleshooting

This is an early beta release that was designed and written by the Apollo Solutions team, you should expect to see some bugs. If you don't, well that's fantstic! Feel free to file an issue on this repo and we'll try and get to it. If it's something that is affecting a lot of users, we'll be looking into it.