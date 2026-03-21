import { getConfig } from "../src/lib/config";
import { TableStore } from "../src/lib/tableStore";
import { getStorageConnectionString } from "../src/lib/util";

async function migrate() {
  console.log("Starting feed migration to Azure Table Storage...\n");

  try {
    const config = getConfig();
    const store = new TableStore(getStorageConnectionString(config.outputStorageAccount));

    console.log(`Storage Account: ${config.outputStorageAccount}`);
    console.log(`Number of feeds to migrate: ${config.sourceFeeds.length}\n`);

    await store.ensureTable();
    console.log("Table storage initialized.\n");

    let successCount = 0;
    let errorCount = 0;

    for (const feed of config.sourceFeeds) {
      const entity = {
        partitionKey: "default",
        rowKey: feed.id,
        id: feed.id,
        name: feed.name,
        url: feed.url,
        enabled: true,
      };

      try {
        await store.createFeed(entity);
        console.log(`✓ Migrated: ${feed.id} (${feed.name})`);
        successCount++;
      } catch (error: unknown) {
        // Check if it's a duplicate (409 conflict)
        if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 409) {
          console.log(`⚠ Skipped (already exists): ${feed.id}`);
        } else {
          console.error(`✗ Failed: ${feed.id}`, error);
          errorCount++;
        }
      }
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${config.sourceFeeds.length}`);

    if (successCount > 0) {
      console.log(`\n✓ Migration completed successfully!`);
      console.log(`\nNext steps:`);
      console.log(`1. Set ENABLE_TABLE_STORAGE=true in your Azure Function app settings`);
      console.log(`2. Trigger a manual refresh to verify feeds are loaded from table storage`);
    }
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  }
}

migrate().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
