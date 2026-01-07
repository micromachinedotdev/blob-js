

type ListObjectOptions =  {
    prefix?: string
    continuationToken?: string
    delimiter?: string
    maxKeys?: number
    startAfter?: string
    encodingType?: "url"
    fetchOwner?: boolean
}

type PresignOptions = {
    expiresIn?: number
    method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD"
    partSize?: number
    queueSize?: number
    retry?: number
    type?: string
}

interface BlobOptions extends BlobPropertyBag {
    bucket?: string
    region?: string
    accessKeyId?: string
    secretAccessKey?: string
    endpoint?: string
    partSize?: number
    queueSize?: number
    retry?: number
    type?: string
    highWaterMark?: number
}

export class Blob {
    list(input?: ListObjectOptions) {
        throw new Error("Method not implemented.");
    }

    write(path: string, data: string | Uint8Array | Buffer | ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Request | Response | Blob | File) {
        throw new Error("Method not implemented.");
    }

    delete(path: string) {
        throw new Error("Method not implemented.");
    }

    unlink(path: string) {
        throw new Error("Method not implemented.");
    }

    get(path: string) {
        throw new Error("Method not implemented.");
    }

    file(path: string) {
        throw new Error("Method not implemented.");
    }

    stat(path: string) {
        throw new Error("Method not implemented.");
    }

    presigned(path: string, options?: PresignOptions) {
        throw new Error("Method not implemented.");
    }

    exists(path: string) {
        throw new Error("Method not implemented.");
    }

    size(path: string){
        throw new Error("Method not implemented.");
    }
}