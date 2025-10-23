import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatInterface } from "@/components/ChatInterface";
import { useChatContext } from "@/contexts/ChatContext";

const Chat = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open");
    return stored ? JSON.parse(stored) : true;
  });
  const params = useParams();
  const navigate = useNavigate();
  const { createNewChat, getChat } = useChatContext();

  useEffect(() => {
    localStorage.setItem("sidebar-open", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    // If no chat ID and at root, create a new chat
    if (!params.id && location.pathname === "/") {
      const newId = createNewChat();
      navigate(`/chat/${newId}`, { replace: true });
    }
  }, [params.id, createNewChat, navigate]);

  // Check if the chat exists
  useEffect(() => {
    if (params.id) {
      const chat = getChat(params.id);
      if (!chat) {
        // Chat doesn't exist, create a new one
        const newId = createNewChat();
        navigate(`/chat/${newId}`, { replace: true });
      }
    }
  }, [params.id, getChat, createNewChat, navigate]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar - Always part of layout; we toggle width so chat stays visible */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-0"} transition-all duration-200 overflow-hidden flex-shrink-0 border-r border-sidebar-border`}
      >
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content - Takes remaining space */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <ChatInterface chatId={params.id} />
      </div>
    </div>
  );
};

export default Chat;
