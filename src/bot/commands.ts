import { ApplicationCommandOptionType } from "discord.js";

export const commands = [
  {
    name: "join",
    description: "Opt into the weekly training crew",
    dm_permission: false,
  },
  {
    name: "done",
    description: "Log a training session for today",
    dm_permission: false,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "note",
        description: "What you trained",
        required: false,
      },
    ],
  },
  {
    name: "status",
    description: "This week's progress and streaks",
    dm_permission: false,
  },
] as const;
