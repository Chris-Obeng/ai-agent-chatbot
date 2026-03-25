import { tool } from "ai";
import { z } from "zod/v4";

export const getWeather = tool({
  description: "Get a simple weather reading for a location.",
  inputSchema: z.object({
    location: z.string().min(1).describe("The place to get the weather for."),
  }),
  execute: async ({ location }) => {
    return `The weather for ${location} is ${Math.round(Math.random() * 72)} F.`;
  },
});

export const allTools = {
  getWeather,
};
