import type {
  Interaction,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import type { Config } from "../config.js";
import type { FinesseDb } from "../db.js";
import { doneReply, joinReply, statusMessage } from "../templates.js";

export const CHECK_EMOJI = "✅";

export type AppContext = {
  db: FinesseDb;
  config: Config;
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

async function onInteraction(
  ctx: AppContext,
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }
  if (interaction.guildId !== ctx.config.guildId) {
    return;
  }

  const now = new Date();
  const opts = {
    now,
    timeZone: ctx.config.tz,
    weeklyTarget: ctx.config.weeklyTarget,
  };

  try {
    if (interaction.commandName === "join") {
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
      return;
    }

    if (interaction.commandName === "done") {
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
        { now, timeZone: ctx.config.tz },
      );
      await interaction.reply({
        content: doneReply({
          created: result.created,
          note,
          checkins: result.checkinsThisWeek,
          weeklyTarget: ctx.config.weeklyTarget,
        }),
      });
      return;
    }

    if (interaction.commandName === "status") {
      const status = ctx.db.status(opts);
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
  } catch (error) {
    console.error("[command]", interaction.commandName, error);
    const content = "Something broke. Try again in a moment.";
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
      },
    );
    if (!result.created) {
      return;
    }

    const channel = reaction.message.channel;
    if (channel.isSendable()) {
      await channel.send(
        `Logged **${displayName(fullUser)}** — **${result.checkinsThisWeek}/${ctx.config.weeklyTarget}** this week.`,
      );
    }
  } catch (error) {
    console.error("[reaction]", error);
  }
}
