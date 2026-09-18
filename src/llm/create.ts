import type { Config } from "../config.js";
import { createGeminiProvider } from "./gemini.js";
import type { LlmProvider } from "./types.js";

export function createLlmProvider(config: Config): LlmProvider | null {
  if (config.llmProvider === "none") {
    return null;
  }
  if (config.llmProvider === "gemini") {
    if (!config.geminiApiKey) {
      console.warn(
        "[llm] LLM_PROVIDER=gemini but GEMINI_API_KEY is empty; coach disabled",
      );
      return null;
    }
    return createGeminiProvider(config.geminiApiKey, config.geminiModel);
  }
  throw new Error(
    `Unknown LLM_PROVIDER "${config.llmProvider}". Use gemini or none, or add a provider in src/llm/.`,
  );
}
