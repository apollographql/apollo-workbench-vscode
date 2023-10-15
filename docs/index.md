---
title: Apollo Workbench
description: Overview
---

**Apollo Workbench** is a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=apollographql.apollo-workbench) that helps you design and reason about your organization's graph without writing any server code.

Currently, Workbench is especially useful for working on _federated_ graphs. Whether you're creating a new graph or making changes to an existing one, Workbench helps you understand how your graph composes throughout the design process.

<p>
  <Button
    colorScheme="indigo"
    as={Link}
    to="./setup/"
  >
    Get started
  </Button>
</p>

## Create graphs

### Build graphs from scratch

Quickly create a new design and start adding subgraphs:

<img class="screenshot" src="./images/new-design.gif" alt="Creating a Workbench design from scratch" />

### Import graphs from Studio

After [authenticating Workbench with GraphOS](./setup/#authenticating-with-graphos), you can create local Workbench designs that are based on any GraphOS graph you have access to:

<img class="screenshot" src="./images/design-from-graphos-graph.png" alt="Creating a Workbench design from GraphOS" width="500" />

All subgraphs in the re-created design will default to read-only and you will have to convert them to a local design file if you want to edit them or mock them. You can do this through the prompt that is displayed when you open the schema.

### View supergraph and API schemas

Apollo Workbench runs `rover supergraph config` every time you save a design file.

As soon as you have a design that successfully composes, you can view its supergraph and API schemas:

<img class="screenshot" src="./images/view-supergraphSdl.png" alt="Viewing a supergraph schema in Workbench" width="700" />

These schemas update as you make changes to your subgraph schemas.

## Create operations

### Build operations from scratch

Click "Add operation to design" or the "+" button if you have more than one design. You can associate an image for the design that is sourced from a remote url or local file:

<img class="screenshot" src="./images/new-operation.png" alt="Creating a new operation in Workbench" />

### Import operations from Studio

After [authenticating Workbench with Apollo Studio](./setup/#authenticating-with-apollo-studio), you can import operations that have been executed against any graph you have access to:

<img class="screenshot" src="./images/studio-operations.jpg" alt="Query plan view" width="600" />

See [Importing operations](./import-studio-graph/#importing-operations).

### View query plans

You will need to start the design to access Apollo Explorer where you can view the query plans. Just press the play button for the design:

<img class="screenshot" src="./images/view-query-plan.png" alt="Query plan view" width="700" />

> Your design must compose successfully to be able to view query plan details.

## Debug your graph

### See composition errors in-line

Any composition errors in your design are displayed in both the VS Code editor and the Problems panel. This helps you understand conflicts and resolve them before writing any server code for your subgraphs:

<img class="screenshot" src="./images/composition-error.png" alt="In-line composition error info" width="500" />

### Run locally with mocks

See [Testing designs locally](./mocking/).

<hr/>

Ready to try it out? Continue to [Setup](./setup/).
