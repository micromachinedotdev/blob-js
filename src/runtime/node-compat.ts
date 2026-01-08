import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type {
  R2File,
  R2FilePresignOptions,
  R2ListObjectsOptions,
  R2Options,
  R2ListObjectsResponse,
  R2Stats,
  R2ListObjectContent,
} from "../lib/types.ts";
import { createClient } from "../lib/create-client.ts";
import { R2FileReader } from "../lib/file.ts";

/**
 * A configured S3/R2 bucket instance for managing files.
 * The instance is callable to create R2File instances and provides methods
 * for common operations.
 *
 * @example
 *     // Basic bucket setup
 *     const bucket = new Client({
 *       bucket: "my-bucket",
 *       accessKeyId: "key",
 *       secretAccessKey: "secret"
 *     });
 *
 *     // Get file instance
 *     const file = bucket.file("image.jpg");
 *
 *     // Common operations
 *     await bucket.write("data.json", JSON.stringify({hello: "world"}));
 *     const url = bucket.presign("file.pdf");
 *     await bucket.unlink("old.txt");
 *
 * @category Cloud Storage
 */
export class Client {
  readonly #options: R2Options | undefined;
  /**
   * Create a new instance of an R2 bucket so that credentials can be managed
   * from a single instance instead of being passed to every method.
   *
   * @param options The default options to use for the R2 client. Can be
   * overriden by passing options to the methods.
   * @returns A new Client instance
   *
   * ## Keep R2 credentials in a single instance
   *
   * @example
   *     const bucket = new Client({
   *       accessKeyId: "your-access-key",
   *       secretAccessKey: "your-secret-key",
   *       bucket: "my-bucket",
   *       endpoint: "https://s3.us-east-1.amazonaws.com",
   *       sessionToken: "your-session-token",
   *     });
   *
   *     // Client is callable, so you can do this:
   *     const file = bucket.file("my-file.txt");
   *
   *     // or this:
   *     await file.write("Hello Bun!");
   *     await file.text();
   *
   *     // To delete the file:
   *     await bucket.delete("my-file.txt");
   *
   *     // To write a file without returning the instance:
   *     await bucket.write("my-file.txt", "Hello Bun!");
   *
   */
  constructor(options?: R2Options) {
    this.#options = options;
  }

  /**
   * Creates an R2File instance for the given path.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns An R2File instance
   *
   * @example
   *     const file = bucket.file("image.jpg");
   *     await file.write(imageData);
   *
   *     const configFile = bucket.file("config.json", {
   *       type: "application/json",
   *       acl: "private"
   *     });
   */
  file(path: string, options?: R2Options): R2File {
    return new R2FileReader(path, { ...this.#options, ...options });
  }

  /**
   * Creates an R2File instance for the given path.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns An R2File instance
   *
   * @example
   *     const file = Client.file("image.jpg", credentials);
   *     await file.write(imageData);
   *
   *     const configFile = Client.file("config.json", {
   *       ...credentials,
   *       type: "application/json",
   *       acl: "private"
   *     });
   */
  static file(path: string, options?: R2Options): R2File {
    return new R2FileReader(path, options);
  }

  /**
   * Writes data directly to a path in the bucket.
   * Supports strings, buffers, streams, and web API types.
   *
   * @param path The path to the file in the bucket
   * @param data The data to write to the file
   * @param options Additional R2 options to override defaults
   * @returns The number of bytes written
   *
   * @example
   *     // Write string
   *     await bucket.write("hello.txt", "Hello World");
   *
   *     // Write JSON with type
   *     await bucket.write(
   *       "data.json",
   *       JSON.stringify({hello: "world"}),
   *       {type: "application/json"}
   *     );
   *
   *     // Write from fetch
   *     const res = await fetch("https://example.com/data");
   *     await bucket.write("data.bin", res);
   *
   *     // Write with ACL
   *     await bucket.write("public.html", html, {
   *       acl: "public-read",
   *       type: "text/html"
   *     });
   */
  write(
    path: string,
    data:
      | string
      | ArrayBufferView
      | ArrayBuffer
      | SharedArrayBuffer
      | Request
      | Response
      | R2File
      | Blob
      | File,
    options?: R2Options,
  ): Promise<number> {
    const file = this.file(path, { ...this.#options, ...options });
    return file.write(data);
  }

  /**
   * Writes data directly to a path in the bucket.
   * Supports strings, buffers, streams, and web API types.
   *
   * @param path The path to the file in the bucket
   * @param data The data to write to the file
   * @param options R2 credentials and configuration options
   * @returns The number of bytes written
   *
   * @example
   *     // Write string
   *     await Client.write("hello.txt", "Hello World", credentials);
   *
   *     // Write JSON with type
   *     await Client.write(
   *       "data.json",
   *       JSON.stringify({hello: "world"}),
   *       {
   *         ...credentials,
   *         type: "application/json"
   *       }
   *     );
   *
   *     // Write from fetch
   *     const res = await fetch("https://example.com/data");
   *     await Client.write("data.bin", res, credentials);
   *
   *     // Write with ACL
   *     await Client.write("public.html", html, {
   *       ...credentials,
   *       acl: "public-read",
   *       type: "text/html"
   *     });
   */
  static write(
    path: string,
    data:
      | string
      | ArrayBufferView
      | ArrayBuffer
      | SharedArrayBuffer
      | Request
      | Response
      | R2File
      | Blob
      | File,
    options?: R2Options,
  ): Promise<number> {
    const file = Client.file(path, options);
    return file.write(data);
  }

  /**
   * Generate a presigned URL for temporary access to a file.
   * Useful for generating upload/download URLs without exposing credentials.
   *
   * @param path The path to the file in the bucket
   * @param options Options for generating the presigned URL
   * @returns A presigned URL string
   *
   * @example
   *     // Download URL
   *     const downloadUrl = bucket.presign("file.pdf", {
   *       expiresIn: 3600 // 1 hour
   *     });
   *
   *     // Upload URL
   *     const uploadUrl = bucket.presign("uploads/image.jpg", {
   *       method: "PUT",
   *       expiresIn: 3600,
   *       type: "image/jpeg",
   *       acl: "public-read"
   *     });
   *
   *     // Long-lived public URL
   *     const publicUrl = bucket.presign("public/doc.pdf", {
   *       expiresIn: 7 * 24 * 60 * 60, // 7 days
   *       acl: "public-read"
   *     });
   */
  async presign(path: string, options?: R2FilePresignOptions): Promise<string> {
    const file = this.file(path);
    return file.presign(options);
  }

  /**
   * Generate a presigned URL for temporary access to a file.
   * Useful for generating upload/download URLs without exposing credentials.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and presigned URL configuration
   * @returns A presigned URL string
   *
   * @example
   *     // Download URL
   *     const downloadUrl = Client.presign("file.pdf", {
   *       ...credentials,
   *       expiresIn: 3600 // 1 hour
   *     });
   *
   *     // Upload URL
   *     const uploadUrl = Client.presign("uploads/image.jpg", {
   *       ...credentials,
   *       method: "PUT",
   *       expiresIn: 3600,
   *       type: "image/jpeg",
   *       acl: "public-read"
   *     });
   *
   *     // Long-lived public URL
   *     const publicUrl = Client.presign("public/doc.pdf", {
   *       ...credentials,
   *       expiresIn: 7 * 24 * 60 * 60, // 7 days
   *       acl: "public-read"
   *     });
   */
  static async presign(path: string, options?: R2FilePresignOptions): Promise<string> {
    const file = Client.file(path, options);
    return file.presign(options);
  }

  /**
   * Delete a file from the bucket.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves when deletion is complete
   *
   * @example
   *     // Simple delete
   *     await bucket.unlink("old-file.txt");
   *
   *     // With error handling
   *     try {
   *       await bucket.unlink("file.dat");
   *       console.log("File deleted");
   *     } catch (err) {
   *       console.error("Delete failed:", err);
   *     }
   */
  unlink(path: string, options?: R2Options): Promise<void> {
    const file = this.file(path, options);

    return file.delete();
  }

  /**
   * Delete a file from the bucket.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves when deletion is complete
   *
   * @example
   *     // Simple delete
   *     await Client.unlink("old-file.txt", credentials);
   *
   *     // With error handling
   *     try {
   *       await Client.unlink("file.dat", credentials);
   *       console.log("File deleted");
   *     } catch (err) {
   *       console.error("Delete failed:", err);
   *     }
   */
  static unlink(path: string, options?: R2Options): Promise<void> {
    const file = Client.file(path, options);
    return file.delete();
  }

  /**
   * Delete a file from the bucket.
   * Alias for {@link Client.unlink}.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves when deletion is complete
   *
   * @example
   *     // Simple delete
   *     await bucket.delete("old-file.txt");
   *
   *     // With error handling
   *     try {
   *       await bucket.delete("file.dat");
   *       console.log("File deleted");
   *     } catch (err) {
   *       console.error("Delete failed:", err);
   *     }
   */
  delete(path: string, options?: R2Options): Promise<void> {
    const file = this.file(path, options);
    return file.delete();
  }

  /**
   * Delete a file from the bucket.
   * Alias for {@link Client.unlink}.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves when deletion is complete
   *
   * @example
   *     // Simple delete
   *     await Client.delete("old-file.txt", credentials);
   *
   *     // With error handling
   *     try {
   *       await Client.delete("file.dat", credentials);
   *       console.log("File deleted");
   *     } catch (err) {
   *       console.error("Delete failed:", err);
   *     }
   */
  static delete(path: string, options?: R2Options): Promise<void> {
    const file = Client.file(path, options);
    return file.delete();
  }

  /**
   * Get the size of a file in bytes.
   * Uses HEAD request to efficiently get size.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves to the file size in bytes
   *
   * @example
   *     // Get size
   *     const bytes = await bucket.size("video.mp4");
   *     console.log(`Size: ${bytes} bytes`);
   *
   *     // Check if file is large
   *     if (await bucket.size("data.zip") > 100 * 1024 * 1024) {
   *       console.log("File is larger than 100MB");
   *     }
   */
  async size(path: string, options?: R2Options): Promise<number> {
    const file = this.file(path, options);
    const stat = await file.stat();
    return stat.size;
  }

  /**
   * Get the size of a file in bytes.
   * Uses HEAD request to efficiently get size.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves to the file size in bytes
   *
   * @example
   *     // Get size
   *     const bytes = await Client.size("video.mp4", credentials);
   *     console.log(`Size: ${bytes} bytes`);
   *
   *     // Check if file is large
   *     if (await Client.size("data.zip", credentials) > 100 * 1024 * 1024) {
   *       console.log("File is larger than 100MB");
   *     }
   */
  static async size(path: string, options?: R2Options): Promise<number> {
    const file = this.file(path, options);
    const stat = await file.stat();
    return stat.size;
  }

  /**
   * Check if a file exists in the bucket.
   * Uses HEAD request to check existence.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves to true if the file exists, false otherwise
   *
   * @example
   *     // Check existence
   *     if (await bucket.exists("config.json")) {
   *       const file = bucket.file("config.json");
   *       const config = await file.json();
   *     }
   *
   *     // With error handling
   *     try {
   *       if (!await bucket.exists("required.txt")) {
   *         throw new Error("Required file missing");
   *       }
   *     } catch (err) {
   *       console.error("Check failed:", err);
   *     }
   */
  exists(path: string, options?: R2Options): Promise<boolean> {
    const file = this.file(path, options);
    return file.exists();
  }

  /**
   * Check if a file exists in the bucket.
   * Uses HEAD request to check existence.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves to true if the file exists, false otherwise
   *
   * @example
   *     // Check existence
   *     if (await Client.exists("config.json", credentials)) {
   *       const file = bucket.file("config.json");
   *       const config = await file.json();
   *     }
   *
   *     // With error handling
   *     try {
   *       if (!await Client.exists("required.txt", credentials)) {
   *         throw new Error("Required file missing");
   *       }
   *     } catch (err) {
   *       console.error("Check failed:", err);
   *     }
   */
  static exists(path: string, options?: R2Options): Promise<boolean> {
    const file = Client.file(path, options);
    return file.exists();
  }

  /**
   * Get the stat of a file in an R2-compatible storage service.
   *
   * @param path The path to the file in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves to the file stats
   *
   * @example
   *     const stat = await bucket.stat("my-file.txt");
   */
  stat(path: string, options?: R2Options): Promise<R2Stats> {
    const file = this.file(path, { ...this.#options, ...options });
    return file.stat();
  }

  /**
   * Get the stat of a file in an R2-compatible storage service.
   *
   * @param path The path to the file in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves to the file stats
   *
   * @example
   *     const stat = await Client.stat("my-file.txt", credentials);
   */
  static stat(path: string, options?: R2Options): Promise<R2Stats> {
    const file = Client.file(path, options);
    return file.stat();
  }

  /**
   * Returns some or all (up to 1,000) of the objects in a bucket with each request.
   *
   * You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
   *
   * @param input Options for listing objects in the bucket
   * @param options Additional R2 options to override defaults
   * @returns A promise that resolves to the list response
   *
   * @example
   *     // List (up to) 1000 objects in the bucket
   *     const allObjects = await bucket.list();
   *
   *     // List (up to) 500 objects under `uploads/` prefix, with owner field for each object
   *     const uploads = await bucket.list({
   *       prefix: 'uploads/',
   *       maxKeys: 500,
   *       fetchOwner: true,
   *     });
   *
   *     // Check if more results are available
   *     if (uploads.isTruncated) {
   *       // List next batch of objects under `uploads/` prefix
   *       const moreUploads = await bucket.list({
   *         prefix: 'uploads/',
   *         maxKeys: 500,
   *         startAfter: uploads.contents!.at(-1).key
   *         fetchOwner: true,
   *       });
   *     }
   */
  async list(
    input?: R2ListObjectsOptions | null,
    options?: Pick<
      R2Options,
      "accessKeyId" | "secretAccessKey" | "sessionToken" | "region" | "bucket" | "endpoint"
    >,
  ): Promise<R2ListObjectsResponse> {
    return Client.list(input, { ...this.#options, ...options });
  }

  /**
   * Returns some or all (up to 1,000) of the objects in a bucket with each request.
   *
   * You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
   *
   * @param input Options for listing objects in the bucket
   * @param options R2 credentials and configuration options
   * @returns A promise that resolves to the list response
   *
   * @example
   *     // List (up to) 1000 objects in the bucket
   *     const allObjects = await Client.list(null, credentials);
   *
   *     // List (up to) 500 objects under `uploads/` prefix, with owner field for each object
   *     const uploads = await Client.list({
   *       prefix: 'uploads/',
   *       maxKeys: 500,
   *       fetchOwner: true,
   *     }, credentials);
   *
   *     // Check if more results are available
   *     if (uploads.isTruncated) {
   *       // List next batch of objects under `uploads/` prefix
   *       const moreUploads = await Client.list({
   *         prefix: 'uploads/',
   *         maxKeys: 500,
   *         startAfter: uploads.contents!.at(-1).key
   *         fetchOwner: true,
   *       }, credentials);
   *     }
   */
  static async list(
    input?: R2ListObjectsOptions | null,
    options?: Pick<
      R2Options,
      "accessKeyId" | "secretAccessKey" | "sessionToken" | "region" | "bucket" | "endpoint"
    >,
  ): Promise<R2ListObjectsResponse> {
    const bucket = options?.bucket;
    const client = createClient(options);

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
      }),
    );

    const listObject: R2ListObjectsResponse = {};

    if (response.Name) {
      listObject.name = response.Name;
    }

    if (response.CommonPrefixes) {
      listObject.commonPrefixes = response.CommonPrefixes?.map((p) => ({ prefix: p.Prefix ?? "" }));
    }

    if (response.Delimiter) {
      listObject.delimiter = response.Delimiter;
    }

    if (response.ContinuationToken) {
      listObject.continuationToken = response.ContinuationToken;
    }

    if (response.IsTruncated !== undefined) {
      listObject.isTruncated = response.IsTruncated;
    }

    if (response.EncodingType) {
      listObject.encodingType = response.EncodingType;
    }

    if (response.StartAfter) {
      listObject.startAfter = response.StartAfter;
    }

    if (response.MaxKeys !== undefined) {
      listObject.maxKeys = response.MaxKeys;
    }

    if (response.KeyCount !== undefined) {
      listObject.keyCount = response.KeyCount;
    }

    if (response.Prefix) {
      listObject.prefix = response.Prefix;
    }

    if (response.NextContinuationToken) {
      listObject.nextContinuationToken = response.NextContinuationToken;
    }

    if (response.Contents) {
      listObject.contents = response.Contents?.map((c) => {
        const content: R2ListObjectContent = {
          eTag: c.ETag ?? "",
          key: c.Key ?? "",
        };

        if (c.ChecksumAlgorithm?.[0]) {
          content.checksumAlgorithm = c.ChecksumAlgorithm[0];
        }

        if (c.ChecksumType) {
          content.checksumType = c.ChecksumType;
        }

        if (c.LastModified !== undefined) {
          content.lastModified = new Date(c.LastModified || Date.now()).toISOString();
        }

        if (c.Owner) {
          content.owner = {
            id: c.Owner?.ID,
            displayName: c.Owner?.DisplayName,
          };
        }

        if (c.RestoreStatus) {
          content.restoreStatus = {
            isRestoreInProgress: c.RestoreStatus.IsRestoreInProgress,
            restoreExpiryDate: c.RestoreStatus.RestoreExpiryDate
              ? new Date(c.RestoreStatus.RestoreExpiryDate).toISOString()
              : undefined,
          };
        }

        if (c.Size !== undefined) {
          content.size = c.Size;
        }

        if (c.StorageClass !== undefined) {
          content.storageClass = (c.StorageClass ??
            undefined) as R2ListObjectContent["storageClass"];
        }

        return content;
      });
    }

    return listObject;
  }
}
