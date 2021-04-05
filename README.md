# Apollo Solutions Tooling - Workbench for VS Code

Workbench is a tool built by the Apollo Solutions Team to help design schemas using Apollo Federation and work with the composed results. This need was driven by working countless number of migrations from an existing GraphQL infrastructure (monolith or schema stitched) to an [Apollo Federated architecture](https://www.apollographql.com/docs/federation/).

Head over to the [docs](https://apollographql.github.io/apollo-workbench-vscode/) to learn how you can use this tool.

## Apollo Solutions Team

The Apollo Solutions Team is considered Apollo's first customer. We work with our customers on their graph implementations and every organization has unique challenges (along with a lot of [common ones](https://www.apollographql.com/guide)). When these challenges surface, we sometimes build some tooling or example to solve that unique challenge. This could incorporate many elements of the various Apollo OSS libraries. If you're interested in learning more about the Apollo Solutions Team and an Enterprise relationship with Apollo, please [reach out through our website](https://www.apollographql.com/contact-sales).

## What can you expect from this repo/tool?

This is a tool that is maintained by the Apollo Solutions Team, it is not a supported piece of the Apollo Platform (you can't open a Zendesk ticket for something wrong with this tool). Workbench is built on top of the Apollo OSS libraries and is an example of the type of tooling that is possible due to the declarative nature of Apollo Federation.

If you have any issues, feel free to open an issue or PR and we'll try to evolve the tool to support designing a federated schema. There have been multiple additions to support mocking scenarios and we're very interested in hearing any ideas that might help with schema design.

## What is Apollo Workbench for VS Code?

To get the most out of GraphQL, your organization should expose a single data graph that provides a unified interface for querying any combination of your backing data sources. However, it can be challenging to represent an enterprise-scale data graph with a single, monolithic GraphQL server. Apollo Federation enables you to divide your graph's implementation across multiple composable services and Workbench is the tool to help you design that out with only schema files.

The Apollo Workbench extension for VS Code brings an all-in-one tooling experience for developing federated graphs.

- Creating and working with `.apollo-workbench` files
- Mocking `.apollo-workbench` files
  - Supports remote URLs for any defined service
- Providing composition errors in **Problems** panel within VS Code
- Create and edit GraphQL operations for a loaded `.apollo-workbench` file
- With a fully composed graph, view generated query plans for defined GraphQL operations
- **Apollo Studio Integration**
  - Create a `.apollo-workbench` file from a graph that has been pushed into the schema registry (i.e. `apollo service:push`)
  - Load GraphQL operations from a graph and add them to the loaded `.apollo-workbench` file.

## Getting Started

### Setup

- [Install VS Code](https://code.visualstudio.com/download)
- Download the latest [Apollo Workbench Release](https://github.com/apollographql/apollo-workbench-vscode/releases)
- Open VS Code and click on the Extension icon
- Click on the three dots at the top of the Extension view and select "Install from VSIX"
  - Select the downlaoded Apollo Workbench Release

### Logging in

1. Open VS Code with any folder (a dialog will display if you don't have a folder open)

![No folder open](https://storage.googleapis.com/apollo-workbench-vscode/workbench-no-folder-open.png)

2. Go to your [personal settings in Apollo Studio](https://studio.apollographql.com/user-settings) and copy your user api key. Paste your api key into the extension (which will be saved to your VS Code global state)

![Enter Apollo User API Key](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-api-key.png)

## Troubleshooting

This is an early beta release that was designed and written by the Apollo Solutions team, you should expect to see some bugs. If you don't, well that's fantstic!

This extension works by using a VS Code FileProvider for the `.apollo-workbench` files in the folder you have opened. The fild contains everything in your deisn and is actually just a JSON file. VS Code is using virtual documents for eveyrthing in the deisn.

## Potential Future Additions (no timelines)

- Change history for a given workbench file compared to a graph/variant defined in Apollo Studio
  - _Workflow: Implementation plan for a given schema design_
- (Experimental) Export capabilities
  - Build docker image locally and output run command
  - Export zip project that can provide examples
    - Add default resolvers

## Reference

### Extension Settings

**Important Settings**

- `apollo-workbench.gatewayPort`_(**Default**: 4000)_: Specifies the url endpoint to be used for the Apollo Gateway instance when running mocks
- `apollo-workbench.startingServerPort`_(**Default**: 4001)_: Specifies the starting port to be used in the url endpoint for the mocked federated services
- `apollo-workbench.gatewayReCompositionInterval`_(**Default**: 10000)_: Specifies the interval the Apollo Gateway will try re-composing it's schema in ms
- `apollo-workbench.headersToForwardFromGateway`_(**Default**: [])_: Specifies what headers should be forwarded from the gateway to downstream mocked services
  - Example `apollo-workbench.headersToForwardFromGateway: ["authentication"]`
