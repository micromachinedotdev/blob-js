import type {
  R2ListObjectContent,
  R2ListObjectsOptions,
  R2ListObjectsResponse,
  R2Options,
} from "./types.ts";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "./create-client.ts";

export async function list(
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
      Prefix: input?.prefix,
      ContinuationToken: input?.continuationToken,
      Delimiter: input?.delimiter,
      MaxKeys: input?.maxKeys,
      FetchOwner: input?.fetchOwner,
      EncodingType: input?.encodingType,
      StartAfter: input?.startAfter,
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
        content.storageClass = (c.StorageClass ?? undefined) as R2ListObjectContent["storageClass"];
      }

      return content;
    });
  }

  return listObject;
}
