export type CompleteInput = {
  system: string;
  user: string;
};

/** Swap Gemini for another vendor by implementing this. */
export type LlmProvider = {
  id: string;
  complete(input: CompleteInput): Promise<string>;
};
