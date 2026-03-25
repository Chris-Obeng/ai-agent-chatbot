import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { text } from "stream/consumers";

async function main() {
  process.loadEnvFile?.(".env.local");

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing from .env.local");
  }

  const { text } = await streamText({
    model: openai("gpt-5.4-nano"),
    prompt: `What happened in the world of AI today ${new Date().toDateString()}?`,
    tools: {
      web_search: openai.tools.webSearch(),
    },
  });

  console.log(await text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
