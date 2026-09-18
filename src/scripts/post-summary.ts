import { postSundaySummary, renderSundaySummary } from "../posts.js";
import { bootBot, bootDb, isDryRun } from "./boot.js";

async function main(): Promise<void> {
  if (isDryRun()) {
    const { config, db } = bootDb();
    console.log(renderSundaySummary(db, config));
    db.close();
    return;
  }

  const { client, db, config, shutdown } = await bootBot();
  const text = await postSundaySummary(client, db, config);
  console.log(text);
  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
