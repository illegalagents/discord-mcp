import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const agents = new Map<string, { discordToken: string; client: Client }>();

const registerDiscordAgent = async (agentId: string, discordToken: string) => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    console.log("Discord bot is ready!");
    agents.set(agentId, { discordToken, client });
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Handle incoming messages
    console.log(`Received message: ${message.content}`);
  });

  await client.login(discordToken);
};

export const attachTools = (server: McpServer) => {
  server.tool(
    "register-agent",
    { discordToken: z.string() },
    async ({ discordToken }) => {
      const uuid = randomUUID();

      await registerDiscordAgent(uuid, discordToken);

      return {
        content: [
          {
            type: "text",
            text: `Agent registered with UUID: ${uuid}`,
          },
        ],
      };
    }
  );

  server.tool(
    "send-message",
    { uuid: z.string(), channelId: z.string(), message: z.string() },
    async ({ uuid, channelId, message }) => {
      const agent = agents.get(uuid);
      if (!agent) {
        return {
          content: [
            { type: "text", text: `Agent with UUID ${uuid} not found.` },
          ],
        };
      }
      const { client } = agent;
      const channel = await client.channels.fetch(channelId);

      if (
        !channel ||
        !(channel instanceof TextChannel || channel instanceof ThreadChannel)
      ) {
        return {
          content: [
            {
              type: "text",
              text: `Channel with ID ${channelId} not found or is not a text channel.`,
            },
          ],
        };
      }

      await channel.send(message);
      return {
        content: [
          { type: "text", text: `Message sent to channel ${channelId}` },
        ],
      };
    }
  );

  return server;
};
