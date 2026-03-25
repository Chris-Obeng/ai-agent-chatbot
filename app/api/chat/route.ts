import { createHash, randomUUID } from "node:crypto";
import {
  createAgentUIStreamResponse,
  dynamicTool,
  jsonSchema,
  stepCountIs,
  ToolLoopAgent,
  UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import Smithery from "@smithery/api";
import type { Connection } from "@smithery/api/resources/connections/connections";

import { allTools } from "@/components/ai/tools";

export const runtime = "nodejs";

type JsonRpcErrorShape = {
  code?: number;
  message?: string;
  data?: unknown;
};

type JsonRpcEnvelope = {
  id?: string | number | null;
  jsonrpc?: string;
  result?: unknown;
  error?: JsonRpcErrorShape;
};

type McpToolDefinition = {
  name: string;
  title?: string;
  description?: string | null;
  inputSchema?: unknown;
};

type McpToolsListResult = {
  tools?: McpToolDefinition[];
};

type McpToolCallResult = {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  [key: string]: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function buildBraveMcpUrl(braveApiKey: string) {
  const url = new URL("https://brave.run.tools");
  url.searchParams.set("braveApiKey", braveApiKey);
  return url.toString();
}

function getBraveConnectionId(braveApiKey: string) {
  if (process.env.SMITHERY_BRAVE_CONNECTION_ID) {
    return process.env.SMITHERY_BRAVE_CONNECTION_ID;
  }

  const hash = createHash("sha256")
    .update(braveApiKey)
    .digest("hex")
    .slice(0, 12);

  return `brave-search-${hash}`;
}

function getGmailConnectionId() {
  return process.env.SMITHERY_GMAIL_CONNECTION_ID ?? "gmail-account";
}

function getGmailMcpUrl() {
  return process.env.SMITHERY_GMAIL_MCP_URL ?? "https://server.smithery.ai/gmail";
}

function hasErrorStatus(error: unknown, status: number): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { status?: unknown }).status === status;
}

async function resolveSmitheryNamespace(smithery: Smithery) {
  const configuredNamespace = process.env.SMITHERY_NAMESPACE;

  if (configuredNamespace) {
    await smithery.namespaces.set(configuredNamespace);
    return configuredNamespace;
  }

  const { namespaces } = await smithery.namespaces.list();

  if (namespaces.length > 0) {
    return namespaces[0]!.name;
  }

  const namespace = await smithery.namespaces.create();
  return namespace.name;
}

function parseSseJsonRpcEnvelope(rawPayload: string): JsonRpcEnvelope {
  const dataLines = rawPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

  for (let i = dataLines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(dataLines[i]!) as JsonRpcEnvelope;
    } catch {
      // Keep scanning backwards until we find the JSON payload.
    }
  }

  throw new Error(
    "Failed to parse MCP response payload from Smithery event stream.",
  );
}

function parseJsonRpcEnvelope(payload: unknown): JsonRpcEnvelope {
  if (typeof payload === "string") {
    return parseSseJsonRpcEnvelope(payload);
  }

  if (payload && typeof payload === "object") {
    return payload as JsonRpcEnvelope;
  }

  throw new Error("Invalid MCP response payload.");
}

async function callSmitheryMcp<T>({
  smithery,
  namespace,
  connectionId,
  method,
  params,
}: {
  smithery: Smithery;
  namespace: string;
  connectionId: string;
  method: string;
  params?: Record<string, unknown>;
}): Promise<T> {
  const rawPayload = await smithery.connections.mcp.call(
    connectionId,
    { namespace },
    {
      headers: {
        Accept: "application/json, text/event-stream",
      },
      body: {
        jsonrpc: "2.0",
        id: randomUUID(),
        method,
        params: params ?? {},
      },
    },
  );

  const envelope = parseJsonRpcEnvelope(rawPayload);

  if (envelope.error) {
    throw new Error(
      `MCP ${method} failed: ${envelope.error.message ?? "Unknown error"}`,
    );
  }

  return envelope.result as T;
}

function getToolInputSchema(toolDefinition: McpToolDefinition) {
  if (toolDefinition.inputSchema && typeof toolDefinition.inputSchema === "object") {
    return toolDefinition.inputSchema;
  }

  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

async function ensureConnection({
  smithery,
  namespace,
  connectionId,
  mcpUrl,
  name,
}: {
  smithery: Smithery;
  namespace: string;
  connectionId: string;
  mcpUrl: string;
  name: string;
}) {
  try {
    return await smithery.connections.set(connectionId, {
      namespace,
      name,
      mcpUrl,
    });
  } catch (error) {
    if (!hasErrorStatus(error, 409)) {
      throw error;
    }

    await smithery.connections.delete(connectionId, { namespace });
    return await smithery.connections.set(connectionId, {
      namespace,
      name,
      mcpUrl,
    });
  }
}

function isConnectedConnection(connection: Connection) {
  if (connection.status?.state === "connected") {
    return true;
  }

  if (!connection.status && connection.serverInfo) {
    return true;
  }

  return false;
}

async function createDynamicToolsForConnection({
  smithery,
  namespace,
  connectionId,
}: {
  smithery: Smithery;
  namespace: string;
  connectionId: string;
}) {
  const toolsList = await callSmitheryMcp<McpToolsListResult>({
    smithery,
    namespace,
    connectionId,
    method: "tools/list",
  });

  return Object.fromEntries(
    (toolsList.tools ?? []).map((toolDefinition) => [
      toolDefinition.name,
      dynamicTool({
        title: toolDefinition.title,
        description:
          toolDefinition.description ??
          `Run MCP tool ${toolDefinition.name}.`,
        inputSchema: jsonSchema(getToolInputSchema(toolDefinition)),
        execute: async (input) => {
          const toolCallResult = await callSmitheryMcp<McpToolCallResult>({
            smithery,
            namespace,
            connectionId,
            method: "tools/call",
            params: {
              name: toolDefinition.name,
              arguments: input as Record<string, unknown>,
            },
          });

          if (toolCallResult.isError) {
            const message =
              toolCallResult.content
                ?.map((part) => part.text)
                .filter(Boolean)
                .join("\n")
                .trim() || `MCP tool ${toolDefinition.name} returned an error.`;
            throw new Error(message);
          }

          return toolCallResult;
        },
      }),
    ]),
  );
}

async function createTools() {
  const smithery = new Smithery({
    apiKey: getRequiredEnv("SMITHERY_API_KEY"),
  });
  const namespace = await resolveSmitheryNamespace(smithery);

  const braveApiKey = getRequiredEnv("BRAVE_API_KEY");
  const braveConnectionId = getBraveConnectionId(braveApiKey);
  const braveConnection = await ensureConnection({
    smithery,
    namespace,
    connectionId: braveConnectionId,
    name: "Brave Search",
    mcpUrl: buildBraveMcpUrl(braveApiKey),
  });

  const braveTools = isConnectedConnection(braveConnection)
    ? await createDynamicToolsForConnection({
        smithery,
        namespace,
        connectionId: braveConnectionId,
      })
    : {};

  const gmailConnectionId = getGmailConnectionId();
  const gmailConnection = await ensureConnection({
    smithery,
    namespace,
    connectionId: gmailConnectionId,
    name: "Gmail",
    mcpUrl: getGmailMcpUrl(),
  });

  const gmailConnected = isConnectedConnection(gmailConnection);
  const gmailTools = gmailConnected
    ? await createDynamicToolsForConnection({
        smithery,
        namespace,
        connectionId: gmailConnectionId,
      })
    : {};

  return {
    tools: {
      ...allTools,
      ...braveTools,
      ...gmailTools,
    },
    gmailConnected,
  };
}

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  const { tools, gmailConnected } = await createTools();

  const agent = new ToolLoopAgent({
    model: openai("gpt-4.1-mini"),
    instructions: gmailConnected
      ? "You are a helpful assistant with access to Brave Search and Gmail tools."
      : "You are a helpful assistant with access to Brave Search tools. Gmail tools are unavailable until the user connects their Gmail account.",
    stopWhen: stepCountIs(20),
    tools,
    prepareStep: async ({ messages: stepMessages }) => {
      if (stepMessages.length > 20) {
        return {
          messages: [stepMessages[0], ...stepMessages.slice(-10)],
        };
      }

      return {};
    },
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: request.signal,
  });
}
