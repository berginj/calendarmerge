import { BlobServiceClient, type BlockBlobClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import { AppConfig, ServiceStatus } from "./types";
import { buildPublicStatus } from "./status";

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
    return readStatusBlob(blobClient);
  }

  async readInternalStatus(): Promise<ServiceStatus | null> {
    const blobClient = this.getBlobClient(
      this.config.internalStatusBlobPath,
      this.config.internalStatusContainer,
    );
    return readStatusBlob(blobClient);
  }

  async readStatusForRefresh(): Promise<ServiceStatus | null> {
    return (await this.readInternalStatus()) ?? (await this.readStatus());
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
    await this.writePublicStatus(status);
    await this.writeInternalStatus(status);
  }

  async writePublicStatus(status: ServiceStatus): Promise<void> {
    await this.ensureContainer();
    await this.getBlobClient(this.config.statusBlobPath).uploadData(
      Buffer.from(`${JSON.stringify(buildPublicStatus(status), null, 2)}\n`, "utf8"),
      {
        blobHTTPHeaders: {
          blobContentType: "application/json; charset=utf-8",
        },
      },
    );
  }

  async writeInternalStatus(status: ServiceStatus): Promise<void> {
    await this.ensureContainer(this.config.internalStatusContainer);
    await this.getBlobClient(
      this.config.internalStatusBlobPath,
      this.config.internalStatusContainer,
    ).uploadData(
      Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"),
      {
        blobHTTPHeaders: {
          blobContentType: "application/json; charset=utf-8",
        },
      },
    );
  }

  private async ensureContainer(containerName: string = this.config.outputContainer): Promise<void> {
    await this.serviceClient.getContainerClient(containerName).createIfNotExists();
  }

  private getBlobClient(blobPath: string, containerName: string = this.config.outputContainer) {
    return this.serviceClient
      .getContainerClient(containerName)
      .getBlockBlobClient(blobPath);
  }
}

async function readStatusBlob(blobClient: BlockBlobClient): Promise<ServiceStatus | null> {
  if (!(await blobClient.exists())) {
    return null;
  }

  const response = await blobClient.download();
  const body = await streamToString(response.readableStreamBody);
  return normalizeStatus(JSON.parse(body) as Partial<ServiceStatus>);
}

function normalizeStatus(status: Partial<ServiceStatus>): ServiceStatus {
  return {
    ...status,
    sourceStatuses: status.sourceStatuses ?? [],
    errorSummary: status.errorSummary ?? [],
  } as ServiceStatus;
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
