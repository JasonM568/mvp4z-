import OpenAI from "openai";

export function createOpenAIClient() {
  return new OpenAI({
    apiKey: requiredEnv("OPENAI_API_KEY")
  });
}

export function openAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}
