import { Client } from "./runtime/node-compat.ts";
import { readFile } from "node:fs/promises";

const blob = new Client({
  accessKeyId: "MMkHEJUYD41WwlhqCnqx81ALHK",
  secretAccessKey: "SKK57syrGkECEBcTZAlU2lSssdpHKjYjne",
  endpoint: "https://blob-manager-staging.micromachine.workers.dev",
  bucket: "test-r2-lookup",
});

const now = performance.now();

await blob.write("joke.json", JSON.stringify(await readFile("./.oxlintrc.json", "utf8")), {
  type: "application/json",
});

console.log(await blob.list());

const file = blob.file("joke.json", {
  type: "application/json",
});

console.log(await file.exists());

console.log(await file.stat());

await blob.write("hello-world.html", `<body><h1>Hello World</h1></body>`, {
  acl: "public-read",
  type: "text/html",
});

console.log(await blob.file("hello-world.html").text());

console.log("HTML size is ", (await blob.size("hello-world.html")) / 1024, "KB");

const stream = file.stream();
for await (const chunk of stream) {
  console.log(chunk);
}

// await blob.unlink("joke.json");

console.log(`Completed in ${performance.now() - now} ms`);
