import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import { AppConfig, ServiceStatus } from "./types";

export class BlobStore {
  private readonly serviceClient: BlobServiceClient;

  constructor(private readonly config: AppConfig) {
    // Use connection string from environment if available, otherwise use managed identity
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else {
      this.serviceClient = new BlobServiceClient(
        `https://${config.outputStorageAccount}.blob.core.windows.net`,
        new DefaultAzureCredential(),
      );
    }
  }

  async calendarExists(blobPath: string = this.config.outputBlobPath): Promise<boolean> {
    return this.getBlobClient(blobPath).exists();
  }

  async readStatus(): Promise<ServiceStatus | null> {
    const blobClient = this.getBlobClient(this.config.statusBlobPath);
    if (!(await blobClient.exists())) {
      return null;
    }

    const response = await blobClient.download();
    const body = await streamToString(response.readableStreamBody);
    return JSON.parse(body) as ServiceStatus;
  }

  async writeCalendar(calendarText: string, blobPath: string = this.config.outputBlobPath): Promise<void> {
    await this.ensureContainer();
    await this.getBlobClient(blobPath).uploadData(Buffer.from(calendarText, "utf8"), {
      blobHTTPHeaders: {
        blobContentType: "text/calendar; charset=utf-8",
      },
    });
  }

  async writePublicJsonBlob(blobPath: string, value: unknown): Promise<void> {
    await this.ensureContainer();
    await this.getBlobClient(blobPath).uploadData(
      Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
      {
        blobHTTPHeaders: {
          blobContentType: "application/json; charset=utf-8",
        },
      },
    );
  }

  async writeStatus(status: ServiceStatus): Promise<void> {
    await this.ensureContainer();
    await this.getBlobClient(this.config.statusBlobPath).uploadData(
      Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"),
      {
        blobHTTPHeaders: {
          blobContentType: "application/json; charset=utf-8",
        },
      },
    );
  }

  private async ensureContainer(): Promise<void> {
    await this.serviceClient.getContainerClient(this.config.outputContainer).createIfNotExists();
  }

  private getBlobClient(blobPath: string) {
    return this.serviceClient
      .getContainerClient(this.config.outputContainer)
      .getBlockBlobClient(blobPath);
  }
}

async function streamToString(stream: NodeJS.ReadableStream | null | undefined): Promise<string> {
  if (!stream) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
