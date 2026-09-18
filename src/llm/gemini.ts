import { GoogleGenAI } from "@google/genai";
import type { LlmProvider } from "./types.js";

export function createGeminiProvider(
  apiKey: string,
  model: string,
): LlmProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    id: "gemini",
    async complete({ system, user }) {
      const response = await ai.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system },
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error("Gemini returned empty text");
      }
      return text;
    },
  };
}
