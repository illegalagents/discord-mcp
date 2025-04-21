import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const agents = new Map<string, { discordToken: string; client: Client }>();

interface PlaygroundMcpsData {
  id: string;
  playgroundId: string;
  created_at: number;
  user_id: string;
  config: {
    id: string;
    name: string;
    type: string;
    envVariables: {
      [key: string]: string;
    };
  };
  agent_id: string;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
    },
  }
);

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

    // here you POST to agent endpoint that avaer is making.
  });

  await client.login(discordToken);
};

const deregisterDiscordAgent = async (agentId: string) => {
  const agent = agents.get(agentId);
  if (agent) {
    await agent.client.destroy();
    agents.delete(agentId);
    console.log(`Agent ${agentId} deregistered.`);
  } else {
    console.log(`Agent ${agentId} not found.`);
  }
};

supabase
  .channel(`playground-mcps-${crypto.randomUUID()}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "playground-mcps",
    },
    async (payload: any) => {
      const data = payload.new as PlaygroundMcpsData;
      if (data && data.config.name === "discord-mcp-server") {
        console.log("Received playground MCPs update:", data);

        const existingAgent = agents.get(data.agent_id);
        const newDiscordToken =
          Object.entries(data.config.envVariables).find(
            ([key]) => key === "DISCORD_TOKEN"
          )?.[1] || "";

        if (existingAgent && existingAgent.discordToken === newDiscordToken) {
          console.log("Agent already registered, skipping registration.");
          return;
        }

        if (existingAgent) {
          console.log("Deregistering existing agent...");
          await deregisterDiscordAgent(data.agent_id);
        }

        await registerDiscordAgent(
          data.agent_id,
          Object.entries(data.config.envVariables).find(
            ([key]) => key === "DISCORD_TOKEN"
          )?.[1] || ""
        );
      }
    }
  )
  .subscribe();

// Create an MCP server
const server = new McpServer({
  name: "discord-mcp",
  version: "1.0.0",
  instructions: [
    `This Discord MCP server provides access to Discord messages.`,
    `You can send and read messages with the provided tools.`,
    `To register an agent, use the 'register-agent' tool with your Discord token and agent endpoint. The agent must send a Discord token and agent endpoint to register.`,
    `To read messages, use the 'read-message' tool with the UUID of the agent and the channel ID.`,
    `To send messages, use the 'send-message' tool with the channel ID and the message content.`,
    `After registering the agent, reuse the same UUID to send and read messages. Save the UUID for future use.`,
  ].join("\n"),
});

server.server.setNotificationHandler(
  z.object({
    method: z.literal("notifications/initialized"),
    // add other fields if needed
  }),
  async (notification) => {
    console.log("Client initialized:", notification);
  }
);

// server.tool(
//   "register-agent",
//   { discordToken: z.string(), agentEndpoint: z.string() },
//   async ({ discordToken, agentEndpoint }) => {
//     const uuid = crypto.randomUUID();

//     await registerDiscordAgent(uuid, agentEndpoint, discordToken);

//     return {
//       content: [{ type: "text", text: `Agent registered with UUID: ${uuid}` }],
//     };
//   }
// );

// server.tool(
//   "read-message",
//   { channelId: z.string(), limit: z.number().optional() },
//   async ({ channelId, limit = 50 }) => {
//     // Check if the agent is registered
//     const agent = agents.get(uuid);
//     if (!agent) {
//       return {
//         content: [{ type: "text", text: `Agent with UUID ${uuid} not found.` }],
//       };
//     }

//     const { client } = agent;
//     const channel = await client.channels.fetch(channelId);

//     if (!channel || !channel.isTextBased()) {
//       return {
//         content: [
//           { type: "text", text: `Channel with ID ${channelId} not found.` },
//         ],
//       };
//     }

//     const messages = await channel.messages.fetch({ limit });

//     const formattedMessages = messages.map((msg) => ({
//       id: msg.id,
//       author: msg.author.username,
//       content: msg.content,
//       createdAt: msg.createdAt.toISOString(),
//     }));

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(formattedMessages, null, 2),
//         },
//       ],
//     };
//   }
// );

server.tool(
  "send-message",
  { uuid: z.string(), channelId: z.string(), message: z.string() },
  async ({ uuid, channelId, message }) => {
    // Check if the agent is registered
    const agent = agents.get(uuid);
    if (!agent) {
      return {
        content: [{ type: "text", text: `Agent with UUID ${uuid} not found.` }],
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
      content: [{ type: "text", text: `Message sent to channel ${channelId}` }],
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
