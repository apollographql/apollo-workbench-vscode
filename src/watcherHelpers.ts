// const { join, resolve } = require("path");
// const { parse } = require('graphql');
// const { gql, ApolloServer } = require("apollo-server");
// const { writeFileSync, existsSync, unlinkSync, readFileSync, readdirSync, mkdirSync } = require("fs");
// const { buildFederatedSchema, printSchema, composeAndValidate } = require('@apollo/federation');

// const queryFolder = join(__dirname, '..', `./query`);
// const generatedSchemasFolder = join(__dirname, '..', "./schemas");
// const workbenchFilePath = join(__dirname, '..', `./master.federationworkbench`);
// const generalQueryErrorsPath = join(queryFolder, "query-errors.json");
// const queryPlanErrorsPath = join(queryFolder, "queryplan-errors.json");

// const {
//     buildQueryPlan,
//     buildOperationContext
// } = require("@apollo/gateway/dist/buildQueryPlan");
// const { serializeQueryPlan } = require("@apollo/gateway/dist/QueryPlan");

// const serversState = {};
// let takenPorts: any = [];

// const updateQueryPlan = (path, stats) => {
//     const workbenchFile = getWorkbenchFile();
//     if (!path || !path.includes('.graphql')) {
//         if (typeof (workbenchFile.query) == 'string') {
//             writeQueryFile('query', workbenchFile.query);
//         } else {
//             for (var key in workbenchFile.query) {
//                 let query = workbenchFile.query[key];
//                 writeQueryFile(key, query);
//             }
//             for (var key in workbenchFile.queryPlan) {
//                 let queryPlan = workbenchFile.queryPlan[key];
//                 writeQueryPlanFile(key, queryPlan);
//             }
//         }
//     } else {
//         let destructured = path.split('/');
//         let queryName = destructured[destructured.length - 1].slice(0, -8);
//         let error = null;
//         let queryPlan = "";

//         const queryString = getQueryFile(queryName);

//         if (typeof (workbenchFile.query) == 'string')
//             workbenchFile.query = {}

//         workbenchFile.query[queryName] = queryString;

//         try {
//             const queryAST = parse(queryString);
//             let schema = getComposedSchema();
//             if (schema) {
//                 const context = buildOperationContext(
//                     schema,
//                     queryAST
//                 );
//                 const queryPlanAST = buildQueryPlan(context);
//                 if (queryPlanAST) {
//                     queryPlan = serializeQueryPlan(queryPlanAST);
//                 }

//                 writeQueryPlanFile(queryName, queryPlan);

//                 if (typeof (workbenchFile.queryPlan) == 'string')
//                     workbenchFile.queryPlan = {}

//                 workbenchFile.queryPlan[queryName] = queryPlan;

//                 if (existsSync(queryPlanErrorsPath))
//                     unlinkSync(queryPlanErrorsPath);
//                 if (existsSync(generalQueryErrorsPath))
//                     unlinkSync(generalQueryErrorsPath);
//             }
//         } catch (err) {
//             error = err;
//             console.log("You probably don't have a valid query defined, see query/query-errors.json for more details");
//         }

//         if (error)
//             writeFileSync(queryPlanErrorsPath, JSON.stringify(error), { encoding: "utf8" });
//         else if (existsSync(queryPlanErrorsPath))
//             unlinkSync(queryPlanErrorsPath);

//         writeWorkbenchFile(workbenchFile);
//     }
// }

// const setupMocks = (path, stats) => {
//     let workbenchFile = syncGraphQLFilesToWorkbenchFile();

//     let port = 4001;
//     while (serversState[port])
//         port++;
//     let portMapping = {};

//     for (var key in workbenchFile.services) {
//         let serviceName = key;
//         let workbenchSchemaString = workbenchFile.services[key];

//         startServer(serviceName, port, workbenchSchemaString);

//         portMapping[serviceName] = port;
//         takenPorts.push(port);
//         port++;
//     }

//     writePortMapping(portMapping);
//     setTimeout(() => startGateway(), 250);
// }
// let isReady = false;
// const updateSchema = (path, stats) => {
//     if (!path || !path.includes('.graphql')) return;

//     let port = 0;
//     let portMapping = getPortMapping();
//     let serviceName = path.split('/')[1].slice(0, -8);
//     console.log(`Setting up ${serviceName}`);

//     let workbenchFile = getWorkbenchFile();
//     let localSchemaString = getLocalSchemaFromFile(serviceName);
//     workbenchFile.services[serviceName] = localSchemaString;

//     for (var key in portMapping) {
//         if (key == serviceName) {
//             port = portMapping[key];
//         }
//     }

//     if (port > 0) {
//         startServer(serviceName, port, localSchemaString);
//         startGateway();
//     }

//     writePortMapping(portMapping);
//     writeWorkbenchFile(workbenchFile);
//     getComposedSchema();
// }

// const addServer = (path, stats) => {
//     if (!isReady || !path || !path.includes('.graphql')) return;

//     let portMapping = getPortMapping();
//     let serviceName = path.split('/')[1].slice(0, -8);

//     let workbenchFile = getWorkbenchFile();
//     let localSchemaString = getLocalSchemaFromFile(serviceName);

//     if (localSchemaString != workbenchFile.services[serviceName]) {
//         console.log(`Setting up ${serviceName}...`);

//         let port = portMapping[serviceName] || 4000;
//         if (port == 4000) {
//             while (serversState[port])
//                 port++;

//             portMapping[serviceName] = port;
//         }

//         console.log(`  on port ${port}`);

//         startServer(serviceName, port, localSchemaString);
//         workbenchFile.services[serviceName] = localSchemaString;

//         writePortMapping(portMapping);
//         writeWorkbenchFile(workbenchFile);
//         getComposedSchema();
//         startGateway();
//     }
// }

// const deleteServer = (path, stats) => {
//     if (!isReady || !path || !path.includes('.graphql')) return;

//     let portMapping = getPortMapping();
//     let workbenchFile = getWorkbenchFile();
//     let serviceName = path.split('/')[1].slice(0, -8);
//     let port = portMapping[serviceName];
//     process.stdout.write(`Deleting ${serviceName} on port ${port}`);

//     serversState[port].stop();
//     delete serversState[port];
//     delete portMapping[serviceName];
//     delete workbenchFile.services[serviceName];

//     writePortMapping(portMapping);
//     writeWorkbenchFile(workbenchFile);
//     startGateway();
// }

// function getComposedSchema() {
//     let sdls: any = [];
//     let error = null;
//     let composedSchema = null;
//     let compositionErrorFilePath = resolve(generatedSchemasFolder, "composition-errors.json");

//     try {
//         const workbenchFile = getWorkbenchFile();
//         for (var key in workbenchFile.services) {
//             let localSchemaString = getLocalSchemaFromFile(key);
//             sdls.push({ name: key, typeDefs: gql(localSchemaString) });
//         }

//         const { schema, errors } = composeAndValidate(sdls);
//         if (errors.length > 0) {
//             error = errors;
//         }

//         composedSchema = schema;
//     }
//     catch (err) {
//         error = err;
//     }

//     if (error) {
//         console.log(`Composition errors, see ${compositionErrorFilePath}`);
//         writeFileSync(compositionErrorFilePath, JSON.stringify(error), { encoding: "utf8" });
//     } else if (existsSync(compositionErrorFilePath))
//         unlinkSync(compositionErrorFilePath);

//     return composedSchema;
// }

// function startGateway() {
//     if (serversState[4000]) {
//         console.log(`Stopping previous running gateway`);
//         isReady = false;
//         serversState[4000].stop();
//         delete serversState[4000];
//     }

//     console.log(`Starting gateway...`);
//     const server = require("./gateway")();
//     serversState[4000] = server;
//     isReady = true;
// }

// function startServer(serviceName, port, schemaString) {
//     if (serversState[port]) {
//         console.log(`Stoppiing previous running server at port: ${port}`);
//         serversState[port].stop();
//         delete serversState[port];
//     }

//     try {
//         const workBenchTypeDefs = gql(schemaString);
//         const server = new ApolloServer({
//             schema: buildFederatedSchema(workBenchTypeDefs),
//             mocks: true,
//             mockEntireSchema: false,
//             engine: false,
//         });
//         server.listen({ port }).then(({ url }) => console.log(`🚀 ${serviceName} mocked server ready at ${url}`));
//         serversState[port] = server;

//         //Checking differences between workbench schema and saved schema file
//         let localSchemaFilePath = resolve(generatedSchemasFolder, `${serviceName}.graphql`);

//         if (existsSync(localSchemaFilePath)) {
//             let printedWorkBenchSchema = formatSchemaToString(schemaString);
//             let localSchemaString = readFileSync(localSchemaFilePath, { encoding: "utf8" });
//             let printedLocalSchema = formatSchemaToString(localSchemaString);

//             if (printedLocalSchema != printedWorkBenchSchema) {
//                 let workbenchFile = getWorkbenchFile();
//                 workbenchFile.services[serviceName] = localSchemaString;
//                 writeWorkbenchFile(workbenchFile);
//             }
//         } else {
//             writeFileSync(localSchemaFilePath, schemaString, { encoding: "utf8" });
//         }

//         // writeServiceSchemaErrors(serviceName);
//     } catch (err) {
//         writeServiceSchemaErrors(serviceName, err);
//     }
// }

// function syncGraphQLFilesToWorkbenchFile() {
//     if (!existsSync(generatedSchemasFolder))
//         mkdirSync(generatedSchemasFolder);

//     let workbenchFile = getWorkbenchFile();
//     let graphqlFilesFolder = readdirSync(generatedSchemasFolder, { encoding: "utf8" });

//     graphqlFilesFolder.map(fileName => {
//         if (fileName.includes('.graphql')) {
//             let serviceName = fileName.slice(0, -8);
//             let typeDefsString = readFileSync(resolve(generatedSchemasFolder, fileName), { encoding: "utf8" });
//             if (workbenchFile.services[serviceName]) {
//                 if (typeDefsString != workbenchFile.services[serviceName]) {
//                     workbenchFile.services[serviceName] = typeDefsString;
//                 }
//             } else {
//                 workbenchFile.services[serviceName] = typeDefsString;
//             }
//         }
//     });

//     for (var key in workbenchFile.services) {
//         let localSchemaFilePath = resolve(generatedSchemasFolder, `${key}.graphql`);
//         if (!existsSync(localSchemaFilePath))
//             writeFileSync(localSchemaFilePath, workbenchFile.services[key], { encoding: "utf8" });
//     }

//     writeWorkbenchFile(workbenchFile);

//     return workbenchFile;
// }

// function formatSchemaToString(schemaString) {
//     let schema = buildFederatedSchema(gql(schemaString));
//     return printSchema(schema);
// }
// function getQueryFile(queryName) {
//     const queryFilePath = resolve(queryFolder, `${queryName}.graphql`);
//     if (existsSync(queryFilePath))
//         return readFileSync(queryFilePath, { encoding: "utf8" });
//     else {
//         mkdirSync(queryFolder);
//         writeFileSync(queryFilePath, "", { encoding: "utf8" });

//         return "";
//     }
// }
// function writeQueryFile(queryName, query) {
//     if (!existsSync(queryFolder)) mkdirSync(queryFolder);

//     const queryFilePath = resolve(queryFolder, `${queryName}.graphql`);
//     writeFileSync(queryFilePath, query, { encoding: "utf8" });
//     console.log(`Wrote query: ${queryFilePath}`);
// }
// function writeQueryPlanFile(queryName, queryplan) {
//     const queryPlanFilePath = resolve(queryFolder, `${queryName}.queryplan`);
//     writeFileSync(queryPlanFilePath, queryplan, { encoding: "utf8" });
//     console.log(`Query plan updated, see ${queryPlanFilePath}`);
// }
// function getWorkbenchFile() {
//     if (existsSync(workbenchFilePath))
//         return JSON.parse(readFileSync(workbenchFilePath, { encoding: "utf8" }));
//     else {
//         let workbenchFile = { composition: {}, query: "", queryPlan: "", services: {}, selectedService: "" };
//         writeWorkbenchFile(workbenchFile);

//         return workbenchFile;
//     }
// }
// function writeWorkbenchFile(workbenchFile) {
//     writeFileSync(workbenchFilePath, JSON.stringify(workbenchFile), { encoding: "utf8" });
// }
// function getPortMapping() {
//     return JSON.parse(readFileSync(resolve(generatedSchemasFolder, "port-mapping.json"), { encoding: "utf8" }));
// }
// function writePortMapping(portMapping) {
//     writeFileSync(resolve(generatedSchemasFolder, "port-mapping.json"), JSON.stringify(portMapping), { encoding: "utf8" });
// }
// function getLocalSchemaFromFile(serviceName) {
//     let localSchemaFilePath = resolve(generatedSchemasFolder, `${serviceName}.graphql`);
//     return readFileSync(localSchemaFilePath, { encoding: "utf8" });
// }
// function writeServiceSchemaErrors(serviceName, errors) {
//     let errorsString = JSON.stringify(errors);
//     let serviceErorrFileName = `errors-${serviceName}.json`;
//     let serviceErrorFilePath = resolve(generatedSchemasFolder, serviceErorrFileName);
//     if (errorsString && errorsString.length > 0) {
//         console.log(`Error with mocking ${serviceName} schema. See /schemas/${serviceErorrFileName}`);
//         writeFileSync(serviceErrorFilePath, errorsString, { encoding: "utf8" });
//     } else if (existsSync(serviceErrorFilePath))
//         unlinkSync(serviceErrorFilePath);
// }

// module.exports = {
//     updateQueryPlan,
//     setupMocks,
//     updateSchema,
//     addServer,
//     deleteServer,
//     getWorkbenchFile
// }