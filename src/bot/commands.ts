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
  {
    name: "setup",
    description: "Set your level, goal, and weekly target for the coach",
    dm_permission: false,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "level",
        description: "e.g. beginner, intermediate",
        required: false,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: "goal",
        description: "What you're training toward",
        required: false,
      },
      {
        type: ApplicationCommandOptionType.Integer,
        name: "target",
        description: "Sessions per week (default 3)",
        required: false,
        min_value: 1,
        max_value: 7,
      },
    ],
  },
  {
    name: "coach",
    description: "Private session suggestion (only you see the reply)",
    dm_permission: false,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "question",
        description: "What do you want help with?",
        required: false,
      },
    ],
  },
  {
    name: "connect",
    description: "Link Intervals.icu or Strava so workouts count automatically",
    dm_permission: false,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "source",
        description: "Data source (default Intervals.icu)",
        required: false,
        choices: [
          { name: "Intervals.icu", value: "intervals" },
          { name: "Strava", value: "strava" },
        ],
      },
    ],
  },
] as const;
