import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageSquare, Plus } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatItemMenu } from "./ChatItemMenu";
import { DeleteChatDialog } from "./DeleteChatDialog";

interface ChatSidebarProps {
  onClose?: () => void;
}

export const ChatSidebar = ({ onClose }: ChatSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { sessions, createNewChat, deleteChat, renameChat } = useChatContext();
  
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<{ id: string; title: string } | null>(null);

  const handleNewChat = () => {
    const newId = createNewChat();
    navigate(`/chat/${newId}`);
  };

  const handleRenameStart = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      renameChat(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDeleteClick = (id: string, title: string) => {
    setChatToDelete({ id, title });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (chatToDelete) {
      deleteChat(chatToDelete.id);
      if (params.id === chatToDelete.id) {
        navigate("/");
      }
    }
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  };

  const getTimeLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return "Last 7 days";
    if (diffDays <= 30) return "Last 30 days";
    return "Older";
  };

  const groupedSessions = sessions.reduce((acc, session) => {
    const label = getTimeLabel(session.createdAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(session);
    return acc;
  }, {} as Record<string, typeof sessions>);

  const timeOrder = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"];

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
        <Button variant="ghost" size="sm" className="gap-2" onClick={handleNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {timeOrder.map((timeLabel) => {
            const groupSessions = groupedSessions[timeLabel];
            if (!groupSessions || groupSessions.length === 0) return null;

            return (
              <div key={timeLabel} className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                  {timeLabel}
                </div>
                <div className="space-y-1">
                  {groupSessions.map((chat) => {
                    const isActive = location.pathname === `/chat/${chat.id}`;
                    const isRenaming = renamingId === chat.id;

                    return (
                      <div key={chat.id} className="group relative">
                        {isRenaming ? (
                          <div className="px-2 py-2">
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => handleRenameSubmit(chat.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameSubmit(chat.id);
                                } else if (e.key === "Escape") {
                                  setRenamingId(null);
                                }
                              }}
                              autoFocus
                              className="h-8 text-sm"
                            />
                          </div>
                        ) : (
                          <Link to={`/chat/${chat.id}`} onClick={onClose}>
                            <div
                              className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                              }`}
                            >
                              <MessageSquare className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate text-sm flex-1">{chat.title}</span>
                              <ChatItemMenu
                                onRename={() => handleRenameStart(chat.id, chat.title)}
                                onDelete={() => handleDeleteClick(chat.id, chat.title)}
                              />
                            </div>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {sessions.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No chats yet. Create a new chat to get started.
            </div>
          )}
        </div>
      </ScrollArea>

      <DeleteChatDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        chatTitle={chatToDelete?.title || ""}
      />
    </div>
  );
};
