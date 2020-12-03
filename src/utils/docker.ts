import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { pathToArray } from "graphql/jsutils/Path";
import { resolve } from "path";
import { workspace } from "vscode";
import { FileProvider } from "./files/fileProvider";
import { ApolloWorkbenchFile } from "./files/fileTypes";
const AdmZip = require('adm-zip');

export class DockerImageManager {
    static create(wbFilePath: string) {
        const wbFile = JSON.parse(readFileSync(wbFilePath, { encoding: 'utf-8' })) as ApolloWorkbenchFile;
        if (workspace.workspaceFolders && wbFile) {
            const workspacePath = workspace.workspaceFolders[0].uri.fsPath;
            const zipPath = resolve(__dirname, '..', '..', 'media', 'base-image.zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(workspacePath, true);

            let graphName = wbFile.graphName.includes('@') ? wbFile.graphName.replace('@', '-') : wbFile.graphName ?? 'mocked-graph';
            let packageJson = {
                "name": "apollo-workbench-generated-mocked-graph",
                "version": "1.0.0",
                "scripts": {
                    "docker:build": `docker build -t ${graphName} .`,
                    "docker:stop": `docker rm --force ${graphName}`,
                    "docker:run": ""
                },
                "author": "Michael Watson",
                "license": "ISC",
                "dependencies": {
                    "@apollo/federation": "^0.20.4",
                    "@apollo/gateway": "^0.21.1",
                    "apollo-server": "^2.19.0",
                    "graphql": "14.7.0"
                }
            }

            const zipFolderPath = resolve(workspacePath, 'Archive');
            //Write schema files to schemas folder
            let dockerRun = "docker run -p 8000:8000 ";
            let serviceListJson: { name: string, url: string }[] = [];
            let graphConfig: { script: string, name: string, args: string }[] = [{ script: 'gateway.js', name: 'gateway', args: 'gateway 8000' }]
            let port = 8001;
            let dockerFile = "";
            dockerFile += "FROM node:12\n";
            dockerFile += "WORKDIR /server\n";
            dockerFile += "COPY . /server\n";
            dockerFile += "RUN npm install\n";
            dockerFile += "RUN npm install pm2 -g\n";
            dockerFile += `EXPOSE 8000\n`;

            for (var serviceName in wbFile.schemas) {
                //Write schema file to folder
                const schemaFilePath = resolve(zipFolderPath, 'schemas', `${serviceName}.graphql`);
                writeFileSync(schemaFilePath, wbFile.schemas[serviceName].sdl, { encoding: 'utf-8' });

                //Add details to Dockerfile, graph.config.js and servicelist.json
                dockerFile += `EXPOSE ${port}\n`;
                graphConfig.push({ script: 'server.js', name: serviceName, args: `${serviceName} ${port}` });
                serviceListJson.push({ name: serviceName, url: `http://127.0.0.1:${port}` });

                //Add port exposure to docker run command
                dockerRun += `-p ${port}:${port} `

                //Increase port value for next service
                port++;
            }

            const graphConfigFile = `module.exports = ${JSON.stringify(graphConfig)}`;
            dockerFile += 'CMD [ "pm2-runtime","graph.config.js" ]';
            dockerRun += `--detach --name ${graphName} ${graphName}`;
            packageJson.scripts["docker:run"] = dockerRun;

            //Write package.json, Dockerfile, graph.config.js and servicelist.json
            writeFileSync(resolve(zipFolderPath, "package.json"), JSON.stringify(packageJson), { encoding: 'utf-8' });
            writeFileSync(resolve(zipFolderPath, "Dockerfile"), dockerFile, { encoding: 'utf-8' });
            writeFileSync(resolve(zipFolderPath, "graph.config.js"), graphConfigFile, { encoding: 'utf-8' });
            writeFileSync(resolve(zipFolderPath, "serviceList.json"), JSON.stringify(serviceListJson), { encoding: 'utf-8' });

            let stdout = execSync(`cd ${zipFolderPath} && npm i`);
            console.log("Docker image pacakges installed successfully");
            stdout = execSync(`cd ${zipFolderPath} && npm run docker:build`);
            console.log("Docker image built successfully");
            stdout = execSync(`cd ${zipFolderPath} && npm run docker:run`);
            console.log("Docker image running locally");
        }
    }
}