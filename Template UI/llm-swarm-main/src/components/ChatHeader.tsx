import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, Settings, Network, PanelLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface ChatHeaderProps {
  onMenuClick?: () => void;
}

export const ChatHeader = ({ onMenuClick }: ChatHeaderProps) => {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 h-14">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 font-medium">
              GPT-4 Distributed
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-popover">
            <DropdownMenuItem className="cursor-pointer">
              <span className="font-medium">GPT-4 Distributed</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <span>Llama 3.1 70B</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <span>Mistral Large</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <span>Claude 3 Distributed</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-9 w-9 bg-secondary hover:bg-secondary/80"
          >
            <User className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-popover">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/network" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Network
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
