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
  usePromptInputAttachments,
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import {
  BotIcon,
  MessageSquare,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MailIcon, Link2Icon } from "lucide-react";

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
  const { user } = useUser();
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(true);
  const [gmailConnectLoading, setGmailConnectLoading] = useState(false);
  const [gmailDialogOpen, setGmailDialogOpen] = useState(false);
  const [gmailConnectError, setGmailConnectError] = useState<string | null>(
    null,
  );

  const {
    id: chatId,
    clearError,
    error,
    messages,
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

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text.trim() && message.files.length === 0) {
        return;
      }

      if (message.files.length > 0) {
        const { uploadFileAction } = await import("@/lib/actions/upload");
        for (const filePart of message.files) {
          if (filePart.url) {
            const response = await fetch(filePart.url);
            const blob = await response.blob();
            const file = new File([blob], filePart.filename || "upload", { type: filePart.mediaType });
            const formData = new FormData();
            formData.append("file", file);
            formData.append("chatId", chatId);
            await uploadFileAction(formData);
          }
        }
      }

      sendMessage({ text: message.text });
      setInput("");
    },
    [sendMessage, chatId],
  );

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    clearError();
  }, [clearError, setMessages]);

  const refreshGmailStatus = useCallback(async () => {
    setGmailStatusLoading(true);
    try {
      const response = await fetch("/api/smithery/gmail");
      if (!response.ok) throw new Error("Failed to fetch Gmail status.");
      const data = (await response.json()) as GmailStatus;
      setGmailStatus(data);

      if (data.connected && user?.primaryEmailAddress?.emailAddress) {
        const { updateGmailReferenceAction } = await import("@/lib/actions/gmail");
        await updateGmailReferenceAction(user.primaryEmailAddress.emailAddress);
      }
    } catch {
      setGmailStatus({ connected: false, state: "not_connected", authorizationUrl: null });
    } finally {
      setGmailStatusLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    void refreshGmailStatus();
    const onWindowFocus = () => { void refreshGmailStatus(); };
    window.addEventListener("focus", onWindowFocus);
    return () => { window.removeEventListener("focus", onWindowFocus); };
  }, [refreshGmailStatus]);

  const handleConnectGmail = useCallback(async () => {
    setGmailConnectLoading(true);
    setGmailConnectError(null);
    try {
      const response = await fetch("/api/smithery/gmail", { method: "POST" });
      if (!response.ok) throw new Error("Could not start Gmail authorization.");
      const data = (await response.json()) as GmailStatus;
      setGmailStatus(data);
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
      }
      setGmailDialogOpen(false);
    } catch {
      setGmailConnectError("We could not start Gmail authorization. Please try again.");
    } finally {
      setGmailConnectLoading(false);
    }
  }, []);

  const handleDisconnectGmail = useCallback(async () => {
    setGmailConnectLoading(true);
    try {
      const { disconnectGmailAction } = await import("@/lib/actions/gmail");
      await disconnectGmailAction();
      await refreshGmailStatus();
      setGmailDialogOpen(false);
    } catch {
      setGmailConnectError("Failed to disconnect Gmail.");
    } finally {
      setGmailConnectLoading(false);
    }
  }, [refreshGmailStatus]);

  const gmailStatusLabel = useMemo(() => {
    if (gmailStatusLoading) return "Checking Gmail";
    return gmailStatus?.connected ? "Gmail Connected" : "Gmail Not Connected";
  }, [gmailStatus?.connected, gmailStatusLoading]);

  const isGenerating = status === "streaming" || status === "submitted";

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar variant="sidebar" className="bg-sidebar border-r border-sidebar-border">
          <SidebarHeader className="p-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 rounded-xl border-sidebar-border bg-sidebar hover:bg-sidebar-accent"
              onClick={handleNewConversation}
            >
              <PlusIcon className="size-4" />
              <span>New Chat</span>
            </Button>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Integrations
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={gmailStatus?.connected ? "Reconnect Gmail" : "Connect Gmail"}
                      onClick={() => {
                        setGmailConnectError(null);
                        setGmailDialogOpen(true);
                      }}
                      className="px-4"
                    >
                      <MailIcon className="size-4" />
                      <span>{gmailStatus?.connected ? "Reconnect Gmail" : "Connect Gmail"}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="px-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Recent Chats
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive className="px-4">
                      <MessageSquare className="size-4" />
                      <span>Current Conversation</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <UserButton />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">
                  {user?.fullName || user?.primaryEmailAddress?.emailAddress}
                </span>
                <span className="text-[11px] text-sidebar-foreground/60">Free Plan</span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col min-w-0 bg-background relative">
          <header className="flex h-14 items-center justify-between px-4 sticky top-0 z-20 bg-background/50 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h2 className="text-sm font-medium">Lumina</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm">
                <SearchIcon className="size-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-hidden flex flex-col items-center">
            <div className="claude-container w-full flex-1 flex flex-col min-h-0">
              <Conversation className="h-full">
                <ConversationContent className="chat-content pb-32">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="size-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-6 animate-fade-up">
                        <SparklesIcon className="size-8" />
                      </div>
                      <h1 className="text-3xl font-semibold tracking-tight mb-4 animate-fade-up">
                        How can Lumina help you today?
                      </h1>
                      <div className="flex flex-wrap justify-center gap-3 max-w-xl animate-fade-up animation-delay-100">
                        {["Write a memo", "Analyze code", "Plan a trip", "Draft an email"].map((t) => (
                          <Button key={t} variant="outline" className="rounded-2xl border-input px-4 hover:bg-secondary" onClick={() => setInput(t)}>
                            {t}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div key={message.id} className={cn(
                        "w-full animate-fade-up",
                        message.role === "user" ? "message-user" : "message-assistant"
                      )} style={{ animationDelay: `${Math.min(index * 60, 420)}ms` }}>
                        {message.role === "user" ? (
                          <div className="bubble-user">
                            {message.parts.map((part, i) => part.type === "text" ? part.text : null)}
                          </div>
                        ) : (
                          <div className="bubble-assistant">
                            <div className="flex items-start gap-4">
                              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-1">
                                <BotIcon className="size-5" />
                              </div>
                              <div className="flex-1 space-y-4">
                                {message.parts.map((part, i) => {
                                  if (part.type === "text") {
                                    return (
                                      <MessageResponse className="text-[16px] leading-7" key={`${message.id}-${i}`}>
                                        {part.text}
                                      </MessageResponse>
                                    );
                                  }
                                  if (isToolPart(part)) {
                                    const toolPart = part;
                                    return (
                                      <div className="mt-2 w-full max-w-2xl" key={`${message.id}-${i}`}>
                                        <Tool className="border border-input rounded-xl bg-card shadow-sm" defaultOpen={toolIsOpenByDefault(toolPart.state)}>
                                          {isDynamicToolPart(toolPart) ? (
                                            <ToolHeader
                                              type={toolPart.type}
                                              state={toolPart.state}
                                              toolName={toolPart.toolName}
                                              className="px-3 py-2"
                                            />
                                          ) : (
                                            <ToolHeader
                                              type={toolPart.type}
                                              state={toolPart.state}
                                              className="px-3 py-2"
                                            />
                                          )}
                                          <ToolContent className="px-3 pb-3">
                                            <ToolInput input={toolPart.input} />
                                            <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                                          </ToolContent>
                                        </Tool>
                                      </div>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </ConversationContent>
                <ConversationScrollButton className="bottom-4" />
              </Conversation>
            </div>

            <div className="input-container w-full pb-2 sm:pb-6">
              <div className="claude-container">
                <PromptInput
                  onSubmit={handleSubmit}
                  maxFiles={10}
                  maxFileSize={10 * 1024 * 1024} // 10MB
                  className="input-box border border-input shadow-sm hover:border-input/80 transition-colors focus-within:border-primary/30 ring-0 focus-within:ring-0 rounded-3xl"
                >
                  <div className="p-4 pb-0">
                    <AttachmentList />
                    <PromptInputTextarea
                      value={input}
                      placeholder="Reply..."
                      onChange={(event) => setInput(event.currentTarget.value)}
                      className="min-h-[40px] w-full resize-none border-none bg-transparent p-0 text-[16px] leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:min-h-[100px]"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-xl text-muted-foreground hover:bg-secondary"
                        type="button"
                        onClick={() => {
                          const input = document.querySelector('input[type="file"]') as HTMLInputElement;
                          input?.click();
                        }}
                      >
                        <PlusIcon className="size-6" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex items-center gap-1 text-muted-foreground text-sm font-medium px-2 py-1 rounded-lg hover:bg-secondary cursor-pointer">
                        <span>Sonnet 4.6</span>
                        <PlusIcon className="size-3 rotate-45" />
                      </div>
                      <PromptInputSubmit
                        status={status}
                        onStop={stop}
                        disabled={!input.trim() && !isGenerating}
                        className="size-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
                      />
                    </div>
                  </div>
                </PromptInput>
                <div className="mt-3 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    Lumina can make mistakes. Check important info.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>

      <Dialog open={gmailDialogOpen} onOpenChange={setGmailDialogOpen}>
        <DialogContent className="gmail-dialog sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect Gmail</DialogTitle>
            <DialogDescription>
              Authorize Gmail in a secure tab. Once complete, return here and
              connection status will refresh automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="gmail-dialog-panel space-y-4">
            <div className="gmail-dialog-row flex items-center gap-2">
              <MailIcon className="size-4" />
              <span className="text-sm">{gmailStatusLabel}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Gmail access enables Lumina to draft and send emails via MCP tools.
            </p>
            {gmailConnectError && (
              <p className="text-[13px] font-medium text-destructive">{gmailConnectError}</p>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => { void refreshGmailStatus(); }}
              disabled={gmailStatusLoading}
            >
              {gmailStatusLoading ? "Refreshing" : "Refresh Status"}
            </Button>
            {gmailStatus?.connected ? (
              <Button variant="destructive" onClick={handleDisconnectGmail} disabled={gmailConnectLoading}>
                <XIcon className="mr-2 size-4" />
                {gmailConnectLoading ? "Disconnecting..." : "Disconnect Gmail"}
              </Button>
            ) : (
              <Button onClick={handleConnectGmail} disabled={gmailConnectLoading}>
                <MailIcon className="mr-2 size-4" />
                {gmailConnectLoading ? "Opening..." : "Connect Gmail"}
                <Link2Icon className="ml-2 size-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function AttachmentList() {
  const { files, remove } = usePromptInputAttachments();

  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {files.map((file) => (
        <div key={file.id} className="group relative flex flex-col w-28 aspect-[4/5] rounded-xl border border-input bg-background overflow-hidden animate-in fade-in zoom-in duration-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex-1 bg-secondary/30 flex items-center justify-center p-2 relative overflow-hidden">
            {file.mediaType?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={file.filename} className="h-full w-full object-cover rounded-sm" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                   <PaperclipIcon className="size-5" />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{file.mediaType?.split('/')[1] || 'FILE'}</span>
              </div>
            )}
          </div>
          <div className="p-2 bg-background border-t border-input">
            <p className="text-[10px] font-medium truncate text-center">{file.filename}</p>
          </div>
          <button
            onClick={() => remove(file.id)}
            className="absolute right-1 top-1 size-6 rounded-full bg-background/80 backdrop-blur shadow-sm border border-input flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-destructive hover:text-destructive-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
