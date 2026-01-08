import type { R2Options } from "./types.ts";
import { S3Client } from "@aws-sdk/client-s3";

export const createClient = (options?: R2Options) => {
  return new S3Client({
    endpoint: options?.endpoint ?? process.env.R2_ENDPOINT,
    region: "auto",
    forcePathStyle: options?.virtualHostedStyle ?? true,
    credentials: {
      accessKeyId: options?.accessKeyId ?? "",
      secretAccessKey: options?.secretAccessKey ?? "",
      sessionToken: options?.sessionToken,
    },
  });
};
