import { testRunner } from "./testRunner";

(async () => {
    await testRunner();
    await testRunner(true);
})()