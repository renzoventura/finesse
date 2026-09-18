import { REST, Routes } from "discord.js";
import type { Config } from "../config.js";
import type { commands } from "./commands.js";

export async function registerCommands(
  config: Config,
  body: typeof commands,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    {
      body: [...body],
    },
  );
}
