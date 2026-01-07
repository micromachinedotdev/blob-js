import { BlobClient } from "./index";

const blob = new BlobClient({
  accessKeyId: "MMkHEJUYD41WwlhqCnqx81ALHK",
  secretAccessKey: "SKK57syrGkECEBcTZAlU2lSssdpHKjYjne",
  endpoint: "https://blob-manager-staging.micromachine.workers.dev",
  bucket: "test-r2-lookup",
});

await blob.write("joke.json", JSON.stringify({ joke: "Why did the chicken cross the road?" }));
const l = await blob.list();

console.log(l);

console.log(await blob.get("joke.json"));
