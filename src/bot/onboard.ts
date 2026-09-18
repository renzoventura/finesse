import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const ONBOARD = {
  link: "onboard:link",
  watch: "onboard:watch",
  later: "onboard:later",
} as const;

export const CONNECT_SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;
export const CONNECT_NUDGE_GAP_MS = 20 * 60 * 60 * 1000;

export function onboardButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ONBOARD.link)
      .setLabel("Link Intervals.icu")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(ONBOARD.watch)
      .setLabel("How to connect a watch")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ONBOARD.later)
      .setLabel("I'll use /done for now")
      .setStyle(ButtonStyle.Secondary),
  );
}
