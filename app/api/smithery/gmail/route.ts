import Smithery from "@smithery/api";
import type { Connection } from "@smithery/api/resources/connections/connections";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function hasErrorStatus(error: unknown, status: number): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { status?: unknown }).status === status;
}

function getGmailConnectionId() {
  return process.env.SMITHERY_GMAIL_CONNECTION_ID ?? "gmail-account";
}

function getGmailMcpUrl() {
  return process.env.SMITHERY_GMAIL_MCP_URL ?? "https://server.smithery.ai/gmail";
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

async function ensureGmailConnection({
  smithery,
  namespace,
  connectionId,
}: {
  smithery: Smithery;
  namespace: string;
  connectionId: string;
}) {
  try {
    return await smithery.connections.set(connectionId, {
      namespace,
      name: "Gmail",
      mcpUrl: getGmailMcpUrl(),
    });
  } catch (error) {
    if (!hasErrorStatus(error, 409)) {
      throw error;
    }

    await smithery.connections.delete(connectionId, { namespace });
    return await smithery.connections.set(connectionId, {
      namespace,
      name: "Gmail",
      mcpUrl: getGmailMcpUrl(),
    });
  }
}

function toConnectionState(connection: Connection | null) {
  const statusState = connection?.status?.state;
  const connected = statusState === "connected" || (!statusState && !!connection?.serverInfo);

  return {
    connected,
    state: statusState ?? (connected ? "connected" : "not_connected"),
    authorizationUrl:
      statusState === "auth_required"
        ? (connection?.status as { authorizationUrl?: string }).authorizationUrl ?? null
        : null,
  };
}

export async function GET() {
  const smithery = new Smithery({
    apiKey: getRequiredEnv("SMITHERY_API_KEY"),
  });
  const namespace = await resolveSmitheryNamespace(smithery);
  const connectionId = getGmailConnectionId();

  try {
    const connection = await smithery.connections.get(connectionId, { namespace });
    return Response.json({
      namespace,
      connectionId,
      ...toConnectionState(connection),
    });
  } catch (error) {
    if (hasErrorStatus(error, 404)) {
      return Response.json({
        namespace,
        connectionId,
        connected: false,
        state: "not_connected",
        authorizationUrl: null,
      });
    }

    throw error;
  }
}

export async function POST() {
  const smithery = new Smithery({
    apiKey: getRequiredEnv("SMITHERY_API_KEY"),
  });
  const namespace = await resolveSmitheryNamespace(smithery);
  const connectionId = getGmailConnectionId();
  const connection = await ensureGmailConnection({
    smithery,
    namespace,
    connectionId,
  });

  return Response.json({
    namespace,
    connectionId,
    ...toConnectionState(connection),
  });
}
