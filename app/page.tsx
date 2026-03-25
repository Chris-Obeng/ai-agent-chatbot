"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import {
  BotIcon,
  CheckIcon,
  Link2Icon,
  MailIcon,
  MessageSquare,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type GmailStatus = {
  connected: boolean;
  state: string;
  authorizationUrl: string | null;
};

type ChatToolPart = ToolUIPart | DynamicToolUIPart;

function isDynamicToolPart(part: unknown): part is DynamicToolUIPart {
  return (
    !!part &&
    typeof part === "object" &&
    (part as { type?: string }).type === "dynamic-tool"
  );
}

function isToolPart(part: unknown): part is ChatToolPart {
  if (!part || typeof part !== "object") {
    return false;
  }

  const type = (part as { type?: string }).type;
  return (
    type === "dynamic-tool" ||
    (typeof type === "string" && type.startsWith("tool-"))
  );
}

const toolIsOpenByDefault = (state: ChatToolPart["state"]) =>
  state === "output-available" || state === "output-error";

export default function App() {
  const [input, setInput] = useState("");
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(true);
  const [gmailConnectLoading, setGmailConnectLoading] = useState(false);
  const [gmailDialogOpen, setGmailDialogOpen] = useState(false);
  const [gmailConnectError, setGmailConnectError] = useState<string | null>(
    null,
  );

  const {
    clearError,
    error,
    messages,
    regenerate,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat({
    experimental_throttle: 32,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const refreshGmailStatus = useCallback(async () => {
    setGmailStatusLoading(true);

    try {
      const response = await fetch("/api/smithery/gmail", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch Gmail status.");
      }

      const data = (await response.json()) as GmailStatus;
      setGmailStatus(data);
    } catch {
      setGmailStatus({
        connected: false,
        state: "not_connected",
        authorizationUrl: null,
      });
    } finally {
      setGmailStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGmailStatus();

    const onWindowFocus = () => {
      void refreshGmailStatus();
    };

    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [refreshGmailStatus]);

  const handleConnectGmail = useCallback(async () => {
    setGmailConnectLoading(true);
    setGmailConnectError(null);

    try {
      const response = await fetch("/api/smithery/gmail", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not start Gmail authorization.");
      }

      const data = (await response.json()) as GmailStatus;
      setGmailStatus(data);

      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
      }

      setGmailDialogOpen(false);
    } catch {
      setGmailConnectError(
        "We could not start Gmail authorization. Please try again.",
      );
    } finally {
      setGmailConnectLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim()) {
        return;
      }

      sendMessage({ text: message.text });
      setInput("");
    },
    [sendMessage],
  );

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    clearError();
  }, [clearError, setMessages]);

  const handleRegenerate = useCallback(async () => {
    clearError();
    await regenerate();
  }, [clearError, regenerate]);

  const isGenerating = status === "streaming" || status === "submitted";
  const isReady = status === "ready";

  const gmailStatusLabel = useMemo(() => {
    if (gmailStatusLoading) {
      return "Checking Gmail";
    }

    return gmailStatus?.connected ? "Gmail Connected" : "Gmail Not Connected";
  }, [gmailStatus?.connected, gmailStatusLoading]);

  return (
    <div className="app-shell">
      <div className="app-backdrop app-backdrop-left" />
      <div className="app-backdrop app-backdrop-right" />
      <div className="app-grain" />

      <SidebarProvider defaultOpen>
        <Sidebar
          variant="floating"
          collapsible="icon"
          className="apple-sidebar"
        >
          <SidebarHeader className="apple-sidebar-header">
            <div className="apple-brand-lockup group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="apple-brand-mark">
                <SparklesIcon className="size-4" />
              </div>
              <div className="apple-brand-text group-data-[collapsible=icon]:hidden">
                <p className="apple-brand-eyebrow">Portfolio Agent</p>
                <p className="apple-brand-title">Concierge UI</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Brave Search" isActive>
                      <SearchIcon />
                      <span>Brave Search Ready</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="AI Agent">
                      <BotIcon />
                      <span>ToolLoop Agent</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Gmail</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={
                        gmailStatus?.connected
                          ? "Reconnect Gmail"
                          : "Connect Gmail"
                      }
                      onClick={() => {
                        setGmailConnectError(null);
                        setGmailDialogOpen(true);
                      }}
                    >
                      <MailIcon />
                      <span>
                        {gmailStatus?.connected
                          ? "Reconnect Gmail"
                          : "Connect Gmail"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>

                <div className="gmail-sidebar-card group-data-[collapsible=icon]:hidden">
                  <p className="gmail-sidebar-title">Connection</p>
                  <p className="gmail-sidebar-text">{gmailStatusLabel}</p>
                  <p className="gmail-sidebar-caption">
                    Securely connect Gmail to enable drafting and sending mail
                    from chat.
                  </p>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Session</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Regenerate"
                      onClick={handleRegenerate}
                      disabled={!messages.length || isGenerating}
                    >
                      <SparklesIcon />
                      <span>Regenerate Reply</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="New Conversation"
                      onClick={handleNewConversation}
                      disabled={!messages.length && !error}
                    >
                      <MessageSquare />
                      <span>New Conversation</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <div className="runtime-chip group-data-[collapsible=icon]:justify-center">
              {isGenerating ? (
                <Spinner className="size-4" />
              ) : (
                <CheckIcon className="size-4" />
              )}
              <span className="group-data-[collapsible=icon]:hidden">
                {isGenerating ? "Generating" : "Ready"}
              </span>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="apple-main">
          <header className="apple-topbar">
            <div className="apple-topbar-left">
              <SidebarTrigger className="apple-trigger" />
              <div className="min-w-0">
                <h1 className="apple-title">Apple-Inspired AI Workspace</h1>
                <p className="apple-subtitle">
                  Built with AI SDK, AI Elements, and shadcn for a
                  portfolio-grade experience.
                </p>
              </div>
            </div>

            <div className="apple-topbar-right">
              <div className="status-chip">
                <SearchIcon className="size-3.5" />
                Brave Ready
              </div>
              <div className="status-chip">
                <MailIcon className="size-3.5" />
                {gmailStatusLabel}
              </div>
            </div>
          </header>

          <section className="chat-stage">
            <div className="chat-scroll-frame">
              <Conversation className="h-full">
                <ConversationContent className="chat-content">
                  {messages.length === 0 ? (
                    <ConversationEmptyState
                      className="empty-state"
                      icon={<MessageSquare className="size-11 text-zinc-400" />}
                      title="Start a polished conversation"
                      description="Ask for research, writing, or Gmail help and watch tools run in real time."
                    />
                  ) : (
                    messages.map((message, index) => (
                      <Message
                        from={message.role}
                        key={message.id}
                        className={cn(
                          "animate-fade-up",
                          message.role === "user"
                            ? "max-w-[min(680px,86%)]"
                            : "max-w-[min(860px,97%)]",
                        )}
                        style={{
                          animationDelay: `${Math.min(index * 60, 420)}ms`,
                        }}
                      >
                        <MessageContent
                          className={cn(
                            "message-surface",
                            "group-[.is-assistant]:assistant-bubble",
                            "group-[.is-user]:user-bubble",
                          )}
                        >
                          {message.parts.map((part, i) => {
                            if (part.type === "text") {
                              return (
                                <MessageResponse
                                  className="text-[15px] leading-7"
                                  key={`${message.id}-${i}`}
                                >
                                  {part.text}
                                </MessageResponse>
                              );
                            }

                            if (isToolPart(part)) {
                              const toolPart = part;

                              return (
                                <div
                                  className="mt-2 w-full max-w-[560px]"
                                  key={`${message.id}-${i}`}
                                >
                                  <Tool
                                    className="tool-surface"
                                    defaultOpen={toolIsOpenByDefault(
                                      toolPart.state,
                                    )}
                                  >
                                    {isDynamicToolPart(toolPart) ? (
                                      <ToolHeader
                                        type={toolPart.type}
                                        state={toolPart.state}
                                        toolName={toolPart.toolName}
                                        className="px-3 py-2.5"
                                      />
                                    ) : (
                                      <ToolHeader
                                        type={toolPart.type}
                                        state={toolPart.state}
                                        className="px-3 py-2.5"
                                      />
                                    )}
                                    <ToolContent className="space-y-3 px-3 pb-3 pt-0">
                                      <ToolInput input={toolPart.input} />
                                      <ToolOutput
                                        output={toolPart.output}
                                        errorText={toolPart.errorText}
                                      />
                                    </ToolContent>
                                  </Tool>
                                </div>
                              );
                            }

                            return null;
                          })}
                        </MessageContent>
                      </Message>
                    ))
                  )}
                </ConversationContent>
                <ConversationScrollButton className="bottom-5" />
              </Conversation>
            </div>

            <footer className="chat-composer-zone">
              {error && (
                <div className="error-banner">Something went wrong.</div>
              )}

              <PromptInput onSubmit={handleSubmit} className="prompt-shell">
                <PromptInputTextarea
                  value={input}
                  placeholder="Ask for research, strategy, writing, or Gmail actions..."
                  onChange={(event) => setInput(event.currentTarget.value)}
                  className="prompt-textarea"
                />
                <PromptInputSubmit
                  status={status}
                  onStop={stop}
                  disabled={!input.trim() && !isGenerating}
                  className="prompt-submit"
                />
              </PromptInput>

              <div className="composer-meta">
                <p>
                  {isReady
                    ? "Ready for your next prompt"
                    : isGenerating
                      ? "Generating response"
                      : "Preparing chat session"}
                </p>
                <p>Shift + Enter for new line</p>
              </div>
            </footer>
          </section>
        </SidebarInset>
      </SidebarProvider>

      <Dialog open={gmailDialogOpen} onOpenChange={setGmailDialogOpen}>
        <DialogContent className="gmail-dialog">
          <DialogHeader>
            <DialogTitle>Connect Gmail</DialogTitle>
            <DialogDescription>
              Authorize Gmail in a secure tab. Once complete, return here and
              connection status will refresh automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="gmail-dialog-panel">
            <div className="gmail-dialog-row">
              <MailIcon className="size-4" />
              <span>{gmailStatusLabel}</span>
            </div>
            <p className="gmail-dialog-note">
              Gmail access enables drafting and sending emails through assistant
              tool calls. You can reconnect any time.
            </p>
            {gmailConnectError ? (
              <p className="gmail-dialog-error">{gmailConnectError}</p>
            ) : null}
          </div>

          <DialogFooter className="gmail-dialog-footer">
            <Button
              variant="outline"
              onClick={() => {
                void refreshGmailStatus();
              }}
              disabled={gmailStatusLoading}
            >
              {gmailStatusLoading ? "Refreshing" : "Refresh Status"}
            </Button>
            <Button onClick={handleConnectGmail} disabled={gmailConnectLoading}>
              <MailIcon />
              {gmailConnectLoading
                ? "Opening Gmail"
                : gmailStatus?.connected
                  ? "Reconnect Gmail"
                  : "Connect Gmail"}
              <Link2Icon />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
