import { testRunner } from "./testRunner";

(async () => {
    let result = 1;
    result = await testRunner();
    result = await testRunner(true);

    process.exit(result);
})()