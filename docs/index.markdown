---
title: Overview
description: Overview
layout: page
---

**Apollo Workbench** is a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=apollographql.apollo-workbench) that helps you design and reason about your organization's graph without writing any server code. Whether you're creating a new graph or making changes to an existing one, Workbench helps you understand how your graph composes throughout the design process.

## Setup

1. **[Required]** Workbench requires `rover` to run composition. You can Install rover [here](https://www.apollographql.com/docs/rover/getting-started).
2. **_(Optional)_** Login with GraphOS - run the "GraphOS: Login with User API Key" command with a [user api key](https://studio.apollographql.com/user-settings/api-keys)

## Create graphs

There are two ways to start a design in Workbench:

1. Creating a new design, which is a new supergraph `yaml` config file
2. Importing a `yaml` config from a GraphOS variant

### Creating a new design

Quickly create a new design and start adding subgraphs:

<img class="screenshot" src="./images/new-design.gif" alt="Creating a Workbench design from scratch" />

### Import graphs from Studio

After logging into GraphOS, you can create local Workbench designs that are based on any GraphOS graph you have access to:

<img class="screenshot" src="./images/design-from-graphos-graph.png" alt="Creating a Workbench design from GraphOS" width="500" />

> All subgraphs in the re-created design will default to read-only and you will have to convert them to a local design file if you want to edit or mock them. You can do this through the prompt that is displayed when you open the schema.

### View supergraph and API schemas

Apollo Workbench runs `rover supergraph compose` every time you save a design file.

As soon as you have a design that successfully composes, you can view its supergraph schema directly in workbench. If you want to view the API schema, you'll need to [run your design locally](./mocking/).

<img class="screenshot" src="./images/view-supergraphSdl.png" alt="Viewing a supergraph schema in Workbench" width="700" />

## Debug your graph

### See composition errors in-line

Any composition errors in your design are displayed in both the VS Code editor and the Problems panel. This helps you understand conflicts and resolve them before writing any server code for your subgraphs:

<img class="screenshot" src="./images/composition-error.png" alt="In-line composition error info" width="500" />

### Run locally with mocks

See the mocking [docs](./mocking/).

## Create operations

### Build operations from scratch

Click "Add operation to design" or the "+" button if you have more than one design. You can associate an image for the design that is sourced from a remote url or local file:

<img class="screenshot" src="./images/new-operation.png" alt="Creating a new operation in Workbench" />

### Import operations from Studio

After completing the GraphOS Login command, you can import operations that have been executed against any graph you have access to. Just click the graph or graph variant in the "GraphOS Supergraphs" view and the operations will load in the "GraphOS Operations" view. You can then click the "+" icon to add the operation to an existing design:

<img class="screenshot" src="./images/studio-operations.png" alt="Query plan view" width="600" />

### View query plans

You will need to start the design to access Apollo Explorer where you can view the query plans. Just press the play button for the design:

<img class="screenshot" src="./images/view-query-plan.png" alt="Query plan view" width="700" />

> Your design must compose successfully to be able to view query plan details.
