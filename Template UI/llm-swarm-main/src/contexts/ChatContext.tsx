import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface ChatContextType {
  sessions: ChatSession[];
  createNewChat: () => string;
  deleteChat: (id: string) => void;
  renameChat: (id: string, newTitle: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  getChat: (id: string) => ChatSession | undefined;
  updateChatTitle: (chatId: string, firstMessage: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const STORAGE_KEY = "chat-sessions";

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const createNewChat = () => {
    const newId = crypto.randomUUID();
    const newChat: ChatSession = {
      id: newId,
      title: "New chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setSessions((prev) => [newChat, ...prev]);
    return newId;
  };

  const deleteChat = (id: string) => {
    setSessions((prev) => prev.filter((chat) => chat.id !== id));
  };

  const renameChat = (id: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((chat) =>
        chat.id === id
          ? { ...chat, title: newTitle, updatedAt: new Date().toISOString() }
          : chat
      )
    );
  };

  const addMessage = (chatId: string, message: Message) => {
    setSessions((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, message],
              updatedAt: new Date().toISOString(),
            }
          : chat
      )
    );
  };

  const getChat = (id: string) => {
    return sessions.find((chat) => chat.id === id);
  };

  const updateChatTitle = (chatId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    setSessions((prev) =>
      prev.map((chat) =>
        chat.id === chatId && chat.title === "New chat"
          ? { ...chat, title, updatedAt: new Date().toISOString() }
          : chat
      )
    );
  };

  return (
    <ChatContext.Provider
      value={{
        sessions,
        createNewChat,
        deleteChat,
        renameChat,
        addMessage,
        getChat,
        updateChatTitle,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
};
