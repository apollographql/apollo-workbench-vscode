---
title: Apollo Workbench Commands
---

Apollo Workbench has a number of predefined commands that you can use to build your Supergraph with GraphOS. All commands are available through the VS Code Command Palette. 

This page acts as an index of all of these codes and their descriptions for quick reference.

## GraphOS Commands

### Login with User API Key

**package.json command:** *extension.login*

This command is used by the user to login to GraphOS within the extension.

### Logout

**package.json command:** *extension.logout*

This command is used by the user to login to GraphOS within the extension.

### Open Apollo Sandbox  

**package.json command:** *local-supergraph-designs.sandbox*

This command will start a `rover dev` session for any design and then open up the local running sandbox. You can also right click on any local design file to access this command. 

### New Supergraph Design

**package.json command:** *local-supergraph-designs.newDesign*

This command refreshes the "LOCAL SUPERGRAPH DESIGNS" [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view) by reading the yaml files in the open folder, identifying which contain the top level `federation_version` and rendering them into the Tree View.

### New Design from Supergraph in GraphOS

**package.json command:** *local-supergraph-designs.newDesignFromGraphOSSupergraph*

This command copys an existing Supergraph in GraphOS to a local design file. This is meant to be the starting point for designing any changes to a Supergraph in GraphOS.

### Refresh Local Designs

**package.json command:** *local-supergraph-designs.refresh*

This command refreshes the "LOCAL SUPERGRAPH DESIGNS" [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view) by reading the yaml files in the open folder, identifying which contain the top level `federation_version` and rendering them into the Tree View.

### Refresh Supergraphs from GraphOS

**package.json command:** *local-supergraph-designs.refreshSupergraphsFromGraphOS*

This command refreshes the "GRAPHOS SUPERGRAPHs" [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view) by querying the GraphOS Platform API for your Supergraphs.

### Edit Subgraph

**package.json command:** *local-supergraph-designs.editSubgraph*

This command opens a subgraph from a local design file. The subgraph schema can be a local file, in GraphOS or a remote endpoint. Remote sources won't be able to be edited until it is converted to a local design file.

### Check Subgraph Schema

**package.json command:** *local-supergraph-designs.checkSubgraphSchema*

This command runs schema validation on a given designs subgraph schema. This requires a GraphOS account and will run `rover subgraph check` with your proposed schema. If there is a failed report, Apollo Studio will be opened to the report.

### Add Subgraph to Design

**package.json command:** *local-supergraph-designs.addSubgraph*

This command adds a subgraph to a local design file.

### Delete Subgraph from Design

**package.json command:** *local-supergraph-designs.deleteSubgraph*

This command deletes a subgraph from a local design file.

### Mock Subgraph in Design

**package.json command:** *local-supergraph-designs.mockSubgraph*

All references to `subgraphs.schema.workbench_design` in the configuration file will be used for openening, editing and mocking locally for any `rover dev` sessions. This command adds the `workbench_design` to the design file and ensures a schema is created for it (i.e. copying a file pointer or creating a new schema file locally from a remote source).

### Start Supergraph Locally

**package.json command:** *local-supergraph-designs.startRoverDevSession*

Start a `rover dev` session for every `subgraph` defined in the design file. All references to `subgraphs.schema.workbench_design` in the design file will be mocked locally using `@apollo/server` and `@graphql-tools/mock`. You must resolve all composition errors in your design to start a Supergraph locally.

### Stop Supergraph Running Locally

**package.json command:** *local-supergraph-designs.stopRoverDevSession*

Stop all `rover dev` sessions running and close out terminal windows.

### Open Supergraph in GraphOS

**package.json command:** *local-supergraph-designs.openInGraphOS*

Launch (in your browser) the Supergraph in Apollo Studio.

### View Supergraph Schema

**package.json command:** *local-supergraph-designs.viewSupergraphSchema*

This command uses `rover supergraph compose` on your design and opens the composed results. You must resolve all composition errors in your design to view the Supergraph SDL.

### Export Supergraph Schema

**package.json command:** *local-supergraph-designs.exportSupergraphSchema*

This command uses `rover supergraph compose` on your design and saves the composed results to the opened folder in the format `${design_filename}-supergraph-schema.graphql`. You must resolve all composition errors in your design to export the Supergraph SDL.

### Add Operation to Design

**package.json command:** *local-supergraph-designs.addOperation*

This command adds a operation to a local design file. A operation contains the document as a string and a pointer to a design image (`https` or local file).

### Delete Operation from Design

**package.json command:** *local-supergraph-designs.deleteOperation*

This command deletes a operation to a local design file. 

### View Operation UI Design

**package.json command:** *local-supergraph-designs.viewOperationDesign*

This command deletes a operation to a local design file. 

### Switch GraphOS Organization

**package.json command:** *studio-graphs.switchOrg*

You may be a member of multiple organizations within GraphOS. This command allows you to switch between the profiles (*Apollo Workbench currently only supports 1 profile being loaded at a time*).

### Load Operations from GraphOS

**package.json command:** *studio-graphs.loadOperationsFromGraphOS*

This command loads operations for a selected Supergraph from GraphOS. The `apollo-workbench.daysOfOperationsToFetch` setting defaults to 30 days, but can be changed if you have access to longer data retention. This is intended for a user to be able to add an existing operation to their design.

### Add Operation to a Local Design

**package.json command:** *studio-graphs.addToDesign*

This command adds an operation to a local design file. The operation can point to a UI design that is either an `https` url or a local file. 
