import type { BlobOptions, PresignOptions } from "./types.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  R2ListOptions,
  R2Object,
  R2Objects,
  R2Checksums,
  R2Range,
  R2PutOptions,
  R2Conditional,
  R2ObjectBody,
  R2GetOptions,
} from "@cloudflare/workers-types";

export class BlobClient {
  #client: S3Client;
  #options: BlobOptions;

  constructor(options: BlobOptions) {
    this.#client = new S3Client({
      region: "auto",
      endpoint: options.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    this.#options = options;
  }

  async list(input?: R2ListOptions): Promise<R2Objects> {
    const response = await this.#client.send(
      new ListObjectsV2Command({
        Bucket: this.#options.bucket,
        Prefix: input?.prefix,
        Delimiter: input?.delimiter,
        MaxKeys: input?.limit,
        ContinuationToken: input?.cursor,
        StartAfter: input?.startAfter,
      }),
    );

    const objects = (response.Contents || []).map(
      (item) =>
        ({
          key: item.Key!,
          size: item.Size || 0,
          etag: item.ETag || "",
          httpEtag: item.ETag || "",
          uploaded: item.LastModified || new Date(),
          range: {} as R2Range,
          checksums: {} as R2Checksums,
          version: "",
          storageClass: item.StorageClass,
          writeHttpMetadata: () => {},
        }) as R2Object,
    );

    return {
      delimitedPrefixes: response?.CommonPrefixes?.map((prefix) => prefix.Prefix!) ?? [],
      truncated: response.IsTruncated || false,
      cursor: response.NextContinuationToken,
      objects,
    } as R2Objects;
  }

  async write(
    path: string,
    data: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    options?: R2PutOptions & { onlyIf: R2Conditional | Headers },
  ): Promise<R2Object | null> {
    let body;

    if (data instanceof Blob) {
      body = new Uint8Array(await data.arrayBuffer());
    }

    if (data instanceof ArrayBuffer) {
      body = new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
      body = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    if (typeof data === "string") {
      body = data;
    }

    if (data instanceof Uint8Array) {
      body = data;
    }

    if (data instanceof ReadableStream) {
      body = new Uint8Array(await new Response(data).arrayBuffer());
    }

    // Handle conditional operations
    let ifMatch: string | undefined;
    if (options?.onlyIf) {
      if (options.onlyIf instanceof Headers) {
        ifMatch = options.onlyIf.get("if-match") ?? undefined;
      } else if (typeof options.onlyIf === "object" && "etagMatches" in options.onlyIf) {
        ifMatch = options.onlyIf.etagMatches;
      }
    }

    // Convert checksums to base64 strings if provided
    let checksumSHA1: string | undefined;
    let checksumSHA256: string | undefined;

    if (options?.sha1) {
      if (typeof options.sha1 === "string") {
        checksumSHA1 = options.sha1;
      } else if (options.sha1 instanceof ArrayBuffer) {
        checksumSHA1 = btoa(String.fromCharCode(...new Uint8Array(options.sha1)));
      } else if (ArrayBuffer.isView(options.sha1)) {
        checksumSHA1 = btoa(String.fromCharCode(...new Uint8Array(options.sha1.buffer)));
      }
    }

    if (options?.sha256) {
      if (typeof options.sha256 === "string") {
        checksumSHA256 = options.sha256;
      } else if (options.sha256 instanceof ArrayBuffer) {
        checksumSHA256 = btoa(String.fromCharCode(...new Uint8Array(options.sha256)));
      } else if (ArrayBuffer.isView(options.sha256)) {
        checksumSHA256 = btoa(String.fromCharCode(...new Uint8Array(options.sha256.buffer)));
      }
    }

    const response = await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
        Body: body ?? "",
        Metadata: options?.customMetadata,
        ChecksumSHA1: checksumSHA1,
        ChecksumSHA256: checksumSHA256,
        IfMatch: ifMatch,
      }),
    );

    return {
      checksums: {} as R2Checksums,
      httpEtag: response.ETag ?? "",
      httpMetadata: undefined,
      range: undefined,
      size: response.Size ?? 0,
      storageClass: "",
      uploaded: new Date(),
      version: "",
      writeHttpMetadata(_headers): void {},
      key: path,
      etag: response.ETag ?? "",
    };
  }

  async delete(path: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
      }),
    );
  }

  async unlink(path: string): Promise<void> {
    await this.delete(path);
  }

  async get(
    path: string,
    options?: R2GetOptions,
  ): Promise<R2ObjectBody | R2Object | null> {
    // Handle conditional operations
    let ifMatch: string | undefined;
    let ifNoneMatch: string | undefined;

    if (options?.onlyIf) {
      if (options.onlyIf instanceof Headers) {
        ifMatch = options.onlyIf.get("if-match") ?? undefined;
        ifNoneMatch = options.onlyIf.get("if-none-match") ?? undefined;
      } else if (typeof options.onlyIf === "object") {
        if ("etagMatches" in options.onlyIf) {
          ifMatch = options.onlyIf.etagMatches;
        }
        if ("etagDoesNotMatch" in options.onlyIf) {
          ifNoneMatch = options.onlyIf.etagDoesNotMatch;
        }
      }
    }

    // Handle range operations
    let rangeHeader: string | undefined;
    if (options?.range) {
      if (options.range instanceof Headers) {
        rangeHeader = options.range.get("range") ?? undefined;
      } else if (typeof options.range === "object") {
        if ("suffix" in options.range) {
          rangeHeader = `bytes=-${options.range.suffix}`;
        } else if ("offset" in options.range && options.range.offset !== undefined) {
          const start = options.range.offset;
          const end = options.range.length ? start + options.range.length - 1 : "";
          rangeHeader = `bytes=${start}-${end}`;
        } else if ("length" in options.range && options.range.length !== undefined) {
          rangeHeader = `bytes=0-${options.range.length - 1}`;
        }
      }
    }

    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
        IfMatch: ifMatch,
        IfNoneMatch: ifNoneMatch,
        Range: rangeHeader,
        SSECustomerKey: typeof options?.ssecKey === "string" ? options.ssecKey : undefined,
      }),
    );

    // Convert Node.js readable stream to web ReadableStream
    const bodyStream = response.Body?.transformToWebStream() ?? new ReadableStream();
    let bodyUsed = false;

    // Create the R2ObjectBody with all required properties and methods
    return {
      key: path,
      version: response.VersionId ?? "",
      size: response.ContentLength ?? 0,
      etag: response.ETag ?? "",
      httpEtag: response.ETag ?? "",
      checksums: {} as R2Checksums,
      uploaded: response.LastModified ?? new Date(),
      httpMetadata: {
        contentType: response.ContentType,
        contentLanguage: response.ContentLanguage,
        contentDisposition: response.ContentDisposition,
        contentEncoding: response.ContentEncoding,
        cacheControl: response.CacheControl,
      },
      customMetadata: response.Metadata,
      storageClass: response.StorageClass ?? "",
      writeHttpMetadata(_headers): void {},

      // R2ObjectBody specific properties and methods
      get body(): ReadableStream {
        return bodyStream;
      },
      get bodyUsed(): boolean {
        return bodyUsed;
      },
      async arrayBuffer(): Promise<ArrayBuffer> {
        bodyUsed = true;
        const reader = bodyStream.getReader();
        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLength += value.length;
        }

        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        return result.buffer;
      },
      async bytes(): Promise<Uint8Array> {
        const buffer = await this.arrayBuffer();
        return new Uint8Array(buffer);
      },
      async text(): Promise<string> {
        const buffer = await this.arrayBuffer();
        return new TextDecoder().decode(buffer);
      },
      async json<T>(): Promise<T> {
        const text = await this.text();
        return JSON.parse(text);
      },
      async blob(): Promise<Blob> {
        const buffer = await this.arrayBuffer();
        return new Blob([buffer], { type: response.ContentType });
      },
    };
  }

  async file(path: string): Promise<ReadableStream> {
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
      }),
    );

    return response.Body?.transformToWebStream() ?? new ReadableStream();
  }

  async stat(path: string): Promise<R2Object> {
    const response = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
      }),
    );

    return {
      key: path,
      version: response.VersionId ?? "",
      size: response.ContentLength ?? 0,
      etag: response.ETag ?? "",
      httpEtag: response.ETag ?? "",
      checksums: {} as R2Checksums,
      uploaded: response.LastModified ?? new Date(),
      httpMetadata: {
        contentType: response.ContentType,
        contentLanguage: response.ContentLanguage,
        contentDisposition: response.ContentDisposition,
        contentEncoding: response.ContentEncoding,
        cacheControl: response.CacheControl,
      },
      customMetadata: response.Metadata,
      storageClass: response.StorageClass ?? "",
      writeHttpMetadata(_headers): void {},
    };
  }

  async presigned(path: string, options?: PresignOptions): Promise<string> {
    const method = options?.method ?? "GET";
    let command;

    switch (method) {
      case "GET":
        command = new GetObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        });
        break;
      case "PUT":
        command = new PutObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        });
        break;
      case "DELETE":
        command = new DeleteObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        });
        break;
      case "HEAD":
        command = new HeadObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        });
        break;
      default:
        command = new GetObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        });
    }

    const expiresIn = options?.expiresIn ?? 3600; // Default 1 hour
    return await getSignedUrl(this.#client, command, { expiresIn });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({
          Bucket: this.#options.bucket,
          Key: path,
        }),
      );
      return true;
    } catch (error) {
      // If the error is NotFound or NoSuchKey, the object doesn't exist
      if (
        error instanceof Error &&
        "name" in error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      ) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async size(path: string): Promise<number> {
    const response = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#options.bucket,
        Key: path,
      }),
    );

    return response.ContentLength ?? 0;
  }
}
