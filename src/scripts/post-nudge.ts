import { postFallBehindNudge, renderFallBehindNudge } from "../posts.js";
import { defaultNudgeBelow, toLocalDate } from "../streaks.js";
import { bootBot, bootDb, flagValue, isDryRun } from "./boot.js";

function resolveBelow(configTz: string, argv = process.argv): number {
  const raw = flagValue("--below", argv);
  if (raw !== undefined) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        "--below must be a positive integer (nudge if check-ins < N)",
      );
    }
    return value;
  }
  return defaultNudgeBelow(toLocalDate(new Date(), configTz));
}

async function main(): Promise<void> {
  if (isDryRun()) {
    const { config, db } = bootDb();
    const below = resolveBelow(config.tz);
    const text = renderFallBehindNudge(db, config, below);
    console.log(text ?? `(nobody is below ${below} this week)`);
    db.close();
    return;
  }

  const { client, db, config, shutdown } = await bootBot();
  const below = resolveBelow(config.tz);
  const text = await postFallBehindNudge(client, db, config, below);
  console.log(text ?? `(nobody is below ${below} this week)`);
  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
