# Migrating from Monolith to a New Supergraph

1. Create a new workbench file (see [Design a New Supergraph](./new-supergraph.md))
2. Create a new service to represent the "monolith"

   2a. If your monolith has introspection enabled and available on the network you're connected to, you can right click on the monolith and select **Update Schema from URL**. You will be prompted to enter the url for your service and the schema will be fetched and populate the monolith.graphql schema file. (you can also set required headers like an auth header for the GitHub API)
   ![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-monolith-migration.gif)
   2b. If you encounter an issue in 2a, you can just copy the schema into the monolith.graphql file that you created.
3. Create a second service and choose the first entity to define; cut the type from the old service to the new service. You'll most likely have some composition errors that need to be resolved. You can view these in the problems panel of VS Codeand start deciding where types should live.