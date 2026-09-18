import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageReaction,
  ModalBuilder,
  type ModalSubmitInteraction,
  type PartialMessageReaction,
  type PartialUser,
  TextInputBuilder,
  TextInputStyle,
  type User,
} from "discord.js";
import type { Config } from "../config.js";
import type { FinesseDb } from "../db.js";
import {
  clipDiscord,
  coachSystemPrompt,
  coachUserPrompt,
} from "../llm/prompts.js";
import type { LlmProvider } from "../llm/types.js";
import { postChannelMessages } from "../posts.js";
import { oauthRedirectUri } from "../sources/create.js";
import { ingestSource } from "../sources/ingest.js";
import type { ActivitySource } from "../sources/types.js";
import { toLocalDate } from "../streaks.js";
import {
  doneReply,
  joinReply,
  setupReply,
  statusMessage,
} from "../templates.js";

export const CHECK_EMOJI = "✅";

export type AppContext = {
  db: FinesseDb;
  config: Config;
  llm: LlmProvider | null;
  sources: Record<string, ActivitySource>;
};

export function createHandlers(ctx: AppContext) {
  return {
    onInteraction: (interaction: Interaction) =>
      onInteraction(ctx, interaction),
    onReaction: (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => onReaction(ctx, reaction, user),
  };
}

function displayName(user: User): string {
  return user.displayName;
}

function statusOpts(ctx: AppContext, now = new Date()) {
  return {
    now,
    timeZone: ctx.config.tz,
    weeklyTarget: ctx.config.weeklyTarget,
  };
}

async function onInteraction(
  ctx: AppContext,
  interaction: Interaction,
): Promise<void> {
  if (interaction.guildId !== ctx.config.guildId) {
    return;
  }

  try {
    if (interaction.isModalSubmit()) {
      await handleConnectModal(ctx, interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) {
      return;
    }
    if (interaction.commandName === "join") {
      await handleJoin(ctx, interaction);
      return;
    }
    if (interaction.commandName === "done") {
      await handleDone(ctx, interaction);
      return;
    }
    if (interaction.commandName === "status") {
      await handleStatus(ctx, interaction);
      return;
    }
    if (interaction.commandName === "setup") {
      await handleSetup(ctx, interaction);
      return;
    }
    if (interaction.commandName === "coach") {
      await handleCoach(ctx, interaction);
      return;
    }
    if (interaction.commandName === "connect") {
      await handleConnect(ctx, interaction);
    }
  } catch (error) {
    console.error(
      "[command]",
      interaction.isChatInputCommand()
        ? interaction.commandName
        : interaction.isModalSubmit()
          ? interaction.customId
          : "interaction",
      error,
    );
    const content = "Something broke. Try again in a moment.";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction
          .followUp({ content, ephemeral: true })
          .catch(() => undefined);
      } else {
        await interaction
          .reply({ content, ephemeral: true })
          .catch(() => undefined);
      }
    }
  }
}

async function handleJoin(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const result = ctx.db.join(
    interaction.user.id,
    displayName(interaction.user),
  );
  await interaction.reply({
    content: joinReply(
      result.already,
      ctx.config.channelId,
      ctx.config.weeklyTarget,
    ),
    ephemeral: true,
  });
}

async function handleDone(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.channelId !== ctx.config.channelId) {
    await interaction.reply({
      content: `Log sessions in <#${ctx.config.channelId}>.`,
      ephemeral: true,
    });
    return;
  }
  const note = interaction.options.getString("note");
  const result = ctx.db.recordCheckin(
    interaction.user.id,
    displayName(interaction.user),
    note,
    { now: new Date(), timeZone: ctx.config.tz, source: "manual" },
  );
  const profile = ctx.db.getUser(interaction.user.id);
  await interaction.reply({
    content: doneReply({
      created: result.created,
      note,
      checkins: result.checkinsThisWeek,
      weeklyTarget: profile?.weeklyTarget ?? ctx.config.weeklyTarget,
    }),
  });
}

async function handleStatus(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const status = ctx.db.status(statusOpts(ctx));
  const you = status.people.find(
    (person) => person.discordId === interaction.user.id,
  );
  await interaction.reply({
    content: statusMessage({
      weekStart: status.weekStart,
      groupStreak: status.groupStreak,
      weeklyTarget: ctx.config.weeklyTarget,
      you,
      people: status.people,
    }),
    ephemeral: true,
  });
}

async function handleSetup(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const level = interaction.options.getString("level") ?? undefined;
  const goal = interaction.options.getString("goal") ?? undefined;
  const target = interaction.options.getInteger("target") ?? undefined;
  if (!level && !goal && target === undefined) {
    const existing = ctx.db.getUser(interaction.user.id);
    await interaction.reply({
      content: existing
        ? setupReply(existing)
        : "Set `level`, `goal`, or `target`. Example: `/setup level:intermediate goal:5k target:3`",
      ephemeral: true,
    });
    return;
  }
  const profile = ctx.db.updateProfile(
    interaction.user.id,
    displayName(interaction.user),
    { level, goal, weeklyTarget: target ?? undefined },
  );
  await interaction.reply({
    content: setupReply(profile),
    ephemeral: true,
  });
}

async function handleCoach(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!ctx.llm) {
    await interaction.reply({
      content:
        "Coach is off until an LLM is configured (`GEMINI_API_KEY` + `LLM_PROVIDER=gemini`).",
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  ctx.db.join(interaction.user.id, displayName(interaction.user));
  const now = new Date();
  const status = ctx.db.status(statusOpts(ctx, now));
  const you = status.people.find(
    (person) => person.discordId === interaction.user.id,
  );
  const today = toLocalDate(now, ctx.config.tz);
  const recent = ctx.db.weekCheckins(interaction.user.id, status.weekStart);
  const question =
    interaction.options.getString("question") ?? "What should I do today?";
  const text = await ctx.llm.complete({
    system: coachSystemPrompt(),
    user: coachUserPrompt({
      name: displayName(interaction.user),
      question,
      level: you?.level ?? null,
      goal: you?.goal ?? null,
      weeklyTarget: you?.weeklyTarget ?? ctx.config.weeklyTarget,
      checkinsThisWeek: you?.checkins ?? 0,
      trainedToday: recent.some((row) => row.date === today),
      recent,
    }),
  });
  await interaction.editReply({ content: clipDiscord(text) });
}

async function handleConnect(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sourceId = interaction.options.getString("source") ?? "intervals";
  const source = ctx.sources[sourceId];
  if (!source) {
    await interaction.reply({
      content: connectMissingMessage(sourceId),
      ephemeral: true,
    });
    return;
  }
  ctx.db.join(interaction.user.id, displayName(interaction.user));
  if (source.auth === "api_key") {
    await interaction.showModal(apiKeyModal(source.id));
    return;
  }
  if (!ctx.config.publicUrl) {
    await interaction.reply({
      content: `**${sourceId}** OAuth needs \`PUBLIC_URL\` (the public https origin of this bot).`,
      ephemeral: true,
    });
    return;
  }
  const state = ctx.db.createOauthState(interaction.user.id, sourceId);
  const url = source.authorizeUrl(
    state,
    oauthRedirectUri(ctx.config.publicUrl, sourceId),
  );
  const hint =
    sourceId === "intervals"
      ? "Authorizing the Finesse app is what turns on instant Garmin → Intervals pings. Strava-fed activities never ping; the 15-minute pull still catches those.\n"
      : "";
  await interaction.reply({
    content: `${hint}Connect **${sourceId}** (opens in browser):\n${url}`,
    ephemeral: true,
  });
}

async function handleConnectModal(
  ctx: AppContext,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.customId.startsWith("connect:")) {
    return;
  }
  const sourceId = interaction.customId.slice("connect:".length);
  const source = ctx.sources[sourceId];
  if (source?.auth !== "api_key") {
    await interaction.reply({
      content: connectMissingMessage(sourceId),
      ephemeral: true,
    });
    return;
  }
  const apiKey = interaction.fields.getTextInputValue("api_key").trim();
  if (apiKey.length < 8) {
    await interaction.reply({
      content:
        "That doesn't look like an Intervals.icu API key. Copy it from Settings → Developer Settings.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  ctx.db.join(interaction.user.id, displayName(interaction.user));
  try {
    const tokens = await source.verifyApiKey(apiKey);
    ctx.db.upsertSourceAccount({
      discordId: interaction.user.id,
      name: displayName(interaction.user),
      source: source.id,
      ...tokens,
    });
  } catch (error) {
    console.error("[connect]", source.id, error);
    await interaction.editReply({
      content:
        "Intervals.icu rejected that key. In [intervals.icu](https://intervals.icu/) go to **Settings → Developer Settings**, copy the API key, and run `/connect` again. Don't paste it in the channel.",
    });
    return;
  }

  let posted = 0;
  try {
    const result = await ingestSource(ctx.db, source, {
      now: new Date(),
      timeZone: ctx.config.tz,
      lookbackHours: ctx.config.stravaLookbackHours,
      weeklyTarget: ctx.config.weeklyTarget,
    });
    posted = result.notices.length;
    await postChannelMessages(
      interaction.client,
      ctx.config.channelId,
      result.notices,
    );
  } catch (error) {
    console.error("[connect] ingest", source.id, error);
  }

  const logged =
    posted > 0
      ? ` Posted **${posted}** workout(s) from the last ${ctx.config.stravaLookbackHours}h in the crew channel.`
      : ` No new workouts in the last ${ctx.config.stravaLookbackHours}h (already posted, or Intervals has nothing yet).`;
  await interaction.editReply({
    content: `Linked **Intervals.icu**.${logged} New Garmin sessions ping the crew channel within about 15 minutes. \`/done\` still covers indoor / missed sync.`,
  });
}

function connectMissingMessage(sourceId: string): string {
  if (sourceId === "strava") {
    return "Strava isn't wired up yet. Set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `PUBLIC_URL` (a public https URL for the OAuth callback).";
  }
  return `Unknown source \`${sourceId}\`.`;
}

function apiKeyModal(sourceId: string): ModalBuilder {
  const keyInput = new TextInputBuilder()
    .setCustomId("api_key")
    .setLabel("API key from Settings → Developer")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(8)
    .setMaxLength(128)
    .setPlaceholder("Paste your Intervals.icu API key");
  return new ModalBuilder()
    .setCustomId(`connect:${sourceId}`)
    .setTitle("Intervals.icu API key")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(keyInput),
    );
}

async function onReaction(
  ctx: AppContext,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }
    const fullUser = await user.fetch();
    if (fullUser.bot) {
      return;
    }
    if (reaction.emoji.name !== CHECK_EMOJI) {
      return;
    }
    if (reaction.message.channelId !== ctx.config.channelId) {
      return;
    }
    if (reaction.message.guildId !== ctx.config.guildId) {
      return;
    }

    const now = new Date();
    const result = ctx.db.recordCheckin(
      fullUser.id,
      displayName(fullUser),
      null,
      {
        now,
        timeZone: ctx.config.tz,
        source: "manual",
      },
    );
    if (!result.created) {
      return;
    }

    const channel = reaction.message.channel;
    const profile = ctx.db.getUser(fullUser.id);
    if (channel.isSendable()) {
      await channel.send(
        `Logged **${displayName(fullUser)}** — **${result.checkinsThisWeek}/${profile?.weeklyTarget ?? ctx.config.weeklyTarget}** this week.`,
      );
    }
  } catch (error) {
    console.error("[reaction]", error);
  }
}
