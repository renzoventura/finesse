export type PulledSession = {
  date: string;
  note: string | null;
  detail: string | null;
  externalId: string;
};

export type SourceAccount = {
  discordId: string;
  name: string;
  source: string;
  externalId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type SourceTokens = {
  externalId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type ActivitySourceBase = {
  id: string;
  pull(
    account: SourceAccount,
    window: { after: Date },
    timeZone: string,
  ): Promise<PulledSession[]>;
  /** Identity when tokens do not expire (`expiresAt` 0). */
  refresh(account: SourceAccount): Promise<SourceAccount>;
};

export type OauthActivitySource = ActivitySourceBase & {
  auth: "oauth";
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<SourceTokens>;
};

export type ApiKeyActivitySource = ActivitySourceBase & {
  auth: "api_key";
  verifyApiKey(apiKey: string): Promise<SourceTokens>;
};

/**
 * External training data (Intervals.icu). Implementations pull sessions;
 * the bot writes them into checkins and pings the crew channel.
 */
export type ActivitySource = OauthActivitySource | ApiKeyActivitySource;
