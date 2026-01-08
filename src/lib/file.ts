import type { NetworkSink, R2File, R2FilePresignOptions, R2Options, R2Stats } from "./types.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
  type ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "./create-client.ts";

export class R2FileReader implements R2File {
  readonly name: string;
  readonly #options: R2Options | undefined;
  readonly #bucket: string;
  readonly #client: S3Client;
  readonly #range?: { begin?: number; end?: number };

  static list() {}

  constructor(path: string, options?: R2Options, range?: { begin?: number; end?: number }) {
    this.name = path;
    this.#options = options || {};
    this.#client = createClient(options);
    this.#bucket = options?.bucket ?? "";
    this.#range = range;
  }

  // Blob properties
  get size(): number {
    return NaN;
  }

  get type(): string {
    return "";
  }

  get readable(): ReadableStream<Uint8Array<ArrayBuffer>> {
    return this.stream();
  }

  slice(begin?: number, end?: number, contentType?: string): R2File;
  slice(begin?: number, contentType?: string): R2File;
  slice(contentType?: string): R2File;
  slice(
    beginOrContentType?: number | string,
    endOrContentType?: number | string,
    contentType?: string,
  ): R2File {
    let begin: number | undefined;
    let end: number | undefined;
    let type: string | undefined;

    // Parse arguments based on types
    if (typeof beginOrContentType === "string") {
      // slice(contentType)
      type = beginOrContentType;
    } else if (typeof beginOrContentType === "number") {
      begin = beginOrContentType;
      if (typeof endOrContentType === "string") {
        // slice(begin, contentType)
        type = endOrContentType;
      } else if (typeof endOrContentType === "number") {
        // slice(begin, end, contentType)
        end = endOrContentType;
        type = contentType;
      }
    }

    // Merge with existing range if this is already a sliced file
    const newRange: { begin?: number; end?: number } = {};
    if (begin !== undefined || end !== undefined) {
      const existingBegin = this.#range?.begin ?? 0;
      const existingEnd = this.#range?.end;

      if (begin !== undefined) {
        newRange.begin = existingBegin + begin;
      } else {
        newRange.begin = existingBegin;
      }

      if (end !== undefined) {
        if (existingEnd !== undefined) {
          newRange.end = Math.min(existingBegin + end, existingEnd);
        } else {
          newRange.end = existingBegin + end;
        }
      } else {
        newRange.end = existingEnd;
      }
    }

    return new R2FileReader(
      this.name,
      { ...this.#options, type },
      Object.keys(newRange).length > 0 ? newRange : this.#range,
    );
  }

  async exists(): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
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

  writer(options?: R2Options): NetworkSink {
    throw new Error("writer() not yet implemented");
  }

  stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    // oxlint-disable-next-line no-this-alias
    const self = this;
    return new ReadableStream({
      async start(controller) {
        try {
          const response = await self.#client.send(
            new GetObjectCommand({
              Bucket: self.#bucket,
              Key: self.name,
            }),
          );

          if (!response.Body) {
            controller.close();
            return;
          }

          const reader = response.Body.transformToWebStream().getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.name,
      }),
    );

    if (!response.Body) {
      return new ArrayBuffer(0);
    }

    const uint8Array = await response.Body.transformToByteArray();
    // Ensure we return an ArrayBuffer, not SharedArrayBuffer
    const buffer = uint8Array.buffer;
    if (buffer instanceof SharedArrayBuffer) {
      // Convert SharedArrayBuffer to ArrayBuffer
      const regularBuffer = new ArrayBuffer(uint8Array.byteLength);
      new Uint8Array(regularBuffer).set(uint8Array);
      return regularBuffer;
    }
    return buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
  }

  async text(): Promise<string> {
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.name,
      }),
    );

    if (!response.Body) {
      return "";
    }

    return response.Body.transformToString();
  }

  async json<T>(): Promise<T> {
    const text = await this.text();
    return JSON.parse(text) as T;
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.name,
      }),
    );

    if (!response.Body) {
      return new Uint8Array(0) as Uint8Array<ArrayBuffer>;
    }

    const uint8Array = await response.Body.transformToByteArray();
    // Ensure we return a Uint8Array backed by ArrayBuffer, not SharedArrayBuffer
    if (uint8Array.buffer instanceof SharedArrayBuffer) {
      const regularBuffer = new ArrayBuffer(uint8Array.byteLength);
      const result = new Uint8Array(regularBuffer);
      result.set(uint8Array);
      return result as Uint8Array<ArrayBuffer>;
    }
    // TypeScript can't infer that buffer is ArrayBuffer here, so we cast
    return new Uint8Array(
      uint8Array.buffer,
      uint8Array.byteOffset,
      uint8Array.byteLength,
    ) as Uint8Array<ArrayBuffer>;
  }

  async write(
    data:
      | string
      | ArrayBufferView
      | ArrayBuffer
      | SharedArrayBuffer
      | Request
      | Response
      | R2File
      | Blob,
    options?: R2Options,
  ): Promise<number> {
    let body: Buffer | string;
    let contentType = options?.type ?? this.#options?.type;

    if (typeof data === "string") {
      body = Buffer.from(new TextEncoder().encode(data));
    } else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
      body = Buffer.from(data);
    } else if (ArrayBuffer.isView(data)) {
      body = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof Request || data instanceof Response) {
      const arrayBuffer = await data.arrayBuffer();
      body = Buffer.from(arrayBuffer);
      contentType = contentType || data.headers.get("content-type") || undefined;
    } else if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      body = Buffer.from(arrayBuffer);
      contentType = contentType || data.type || undefined;
    } else {
      throw new Error("Unsupported data type");
    }

    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.name,
        Body: body,
        ContentType: contentType,
        ACL: options?.acl as ObjectCannedACL | undefined,
        StorageClass: options?.storageClass,
      }),
    );

    return typeof body === "string" ? Buffer.byteLength(body) : body.length;
  }

  async presign(options?: R2FilePresignOptions): Promise<string> {
    const method = options?.method || "GET";
    let commandToSign;

    switch (method) {
      case "GET":
        commandToSign = new GetObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
        });
        break;
      case "PUT":
        commandToSign = new PutObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
          ContentType: options?.type ?? this.#options?.type,
          ACL: options?.acl as ObjectCannedACL | undefined,
        });
        break;
      case "DELETE":
        commandToSign = new DeleteObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
        });
        break;
      case "HEAD":
        commandToSign = new HeadObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
        });
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return await getSignedUrl(this.#client, commandToSign, {
      expiresIn: options?.expiresIn || 900,
    });
  }

  async delete(): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: this.name,
      }),
    );
  }

  unlink = this.delete;

  async stat(): Promise<R2Stats> {
    try {
      const response = await this.#client.send(
        new HeadObjectCommand({
          Bucket: this.#bucket,
          Key: this.name,
        }),
      );

      return new S3Stat(
        response.ContentType,
        response.ETag,
        response.ContentLength,
        response.LastModified,
      );
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
}

export class S3Stat implements R2Stats {
  type: string;
  etag: string;
  size: number;
  lastModified: Date;
  constructor(type?: string, etag?: string, size?: number, lastModified?: Date) {
    this.type = type ?? "";
    this.etag = etag ?? "";
    this.size = size ?? 0;
    this.lastModified = lastModified ?? new Date();
  }
}
