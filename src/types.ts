export type ListObjectOptions = {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ("httpMetadata" | "customMetadata")[];
};

type R2Range =
  | {
      offset: number;
      length?: number;
    }
  | {
      offset?: number;
      length: number;
    }
  | {
      suffix: number;
    };

type R2Checksums = {
  readonly md5?: ArrayBuffer;
  readonly sha1?: ArrayBuffer;
  readonly sha256?: ArrayBuffer;
  readonly sha384?: ArrayBuffer;
  readonly sha512?: ArrayBuffer;
  toJSON(): R2StringChecksums;
};

type R2StringChecksums = {
  md5?: string;
  sha1?: string;
  sha256?: string;
  sha384?: string;
  sha512?: string;
};

type R2HTTPMetadata = {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
};

type R2Object = {
  readonly key: string;
  readonly version: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly checksums: R2Checksums;
  readonly uploaded: Date;
  readonly httpMetadata?: R2HTTPMetadata;
  readonly customMetadata?: Record<string, string>;
  readonly range?: R2Range;
  readonly storageClass: string;
  readonly ssecKeyMd5?: string;
  writeHttpMetadata(headers: Headers): void;
};

export type ListObjectsOutput = {
  objects: R2Object[];
  delimitedPrefixes: string[];
} & ({ truncated: true; cursor: string } | { truncated: false });

export type PresignOptions = {
  expiresIn?: number;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  partSize?: number;
  queueSize?: number;
  retry?: number;
  type?: string;
};

export interface BlobOptions extends BlobPropertyBag {
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  partSize?: number;
  queueSize?: number;
  retry?: number;
  type?: string;
  highWaterMark?: number;
}
