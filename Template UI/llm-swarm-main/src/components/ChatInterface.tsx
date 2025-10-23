import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip } from "lucide-react";
import { useChatContext, Message } from "@/contexts/ChatContext";

interface ChatInterfaceProps {
  chatId?: string;
}

export const ChatInterface = ({ chatId }: ChatInterfaceProps) => {
  const { getChat, addMessage, updateChatTitle } = useChatContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (chatId) {
      const chat = getChat(chatId);
      setMessages(chat?.messages || []);
    } else {
      setMessages([]);
    }
  }, [chatId, getChat]);

  const handleSend = () => {
    if (!input.trim() || !chatId) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    addMessage(chatId, newMessage);
    setMessages((prev) => [...prev, newMessage]);

    // Update title if this is the first message
    const chat = getChat(chatId);
    if (chat && chat.messages.length === 0) {
      updateChatTitle(chatId, input);
    }

    setInput("");

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm processing your request using the distributed network...",
      };
      addMessage(chatId, aiMessage);
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <h1 className="text-4xl font-semibold mb-4">
                What can I help with?
              </h1>
              <p className="text-muted-foreground">
                Powered by distributed GPU network
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-card border border-border rounded-3xl p-2">
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 rounded-full"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message GPT..."
              className="min-h-[24px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />

            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="icon"
              className="flex-shrink-0 rounded-full"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Powered by distributed network · Currently {Math.floor(Math.random() * 50 + 100)} seeders online
          </p>
        </div>
      </div>
    </div>
  );
};
