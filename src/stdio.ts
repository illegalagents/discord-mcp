import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { attachTools } from "./tools.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const initStdioServer = async () => {
  const server = attachTools(
    new McpServer({
      name: "discord-mcp",
      version: "1.0.0",
    })
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

initStdioServer().catch((error) => {
  console.error("Error initializing Stdio server:", error);
});
