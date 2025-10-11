"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockMessages } from "@/lib/mockData";
import withAuth from "../withAuth"; // <-- IMPORT IT HERE

// Main component for the chat page
function ChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Left Sidebar for Chat History */}
      <ChatHistorySidebar />

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1">
        <ModelSelector />
        <MessageList />
        <ChatInput />
      </div>
    </div>
  );
}

export default withAuth(ChatPage); // <-- WRAP THE COMPONENT

// ... rest of the file remains the same
// Component: Chat History Sidebar
function ChatHistorySidebar() {
  return (
    <div className="w-1/4 border-r p-4 hidden md:block">
      <h2 className="text-lg font-semibold mb-4">Conversations</h2>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-2 pr-4">
          <Button variant="ghost" className="justify-start">
            SNNs and FeFETs
          </Button>
          <Button variant="ghost" className="justify-start text-muted-foreground">
            Petals Benchmark Strategy
          </Button>
          <Button variant="ghost" className="justify-start text-muted-foreground">
            GRE Quant Problems
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// Component: Model Selector Dropdown
function ModelSelector() {
  return (
    <div className="p-4 border-b">
      <Select defaultValue="llama3-8b">
        <SelectTrigger className="w-[280px] mx-auto">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="llama3-8b">Llama 3 8B (Available)</SelectItem>
          <SelectItem value="mixtral-8x7b">Mixtral 8x7B (Available)</SelectItem>
          <SelectItem value="sdxl" disabled>
            Stable Diffusion XL (Unavailable)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// Component: List of Messages
function MessageList() {
  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-6">
        {mockMessages.map((msg, index) => (
          <Message key={index} role={msg.role as "user" | "assistant"} content={msg.content} />
        ))}
      </div>
    </ScrollArea>
  );
}

// Component: A Single Message Bubble
interface MessageProps {
  role:  "user" | "assistant";
  content: string;
}

function Message({ role, content }: MessageProps) {
  const isUser = role === "user";
  return (
    <div className={`flex items-start gap-4 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <Avatar>
          <AvatarImage src="/bot-avatar.png" />
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`rounded-lg p-3 max-w-xl ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </div>
      {isUser && (
        <Avatar>
          <AvatarFallback>You</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// Component: Chat Input Box at the bottom
function ChatInput() {
  return (
    <div className="p-4 border-t">
      <div className="relative">
        <Textarea
          placeholder="Ask anything..."
          className="pr-16"
          rows={1}
        />
        <Button type="submit" size="icon" className="absolute top-1/2 right-3 -translate-y-1/2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
        </Button>
      </div>
    </div>
  );
}