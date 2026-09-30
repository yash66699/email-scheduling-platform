import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';
import { Send, Activity, MessageSquare, LogOut } from 'lucide-react';

interface HeaderProps {
  onOpenCompose: () => void;
}

export function Header({ onOpenCompose }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 h-[56px] bg-[#0C0E12]/95 backdrop-blur border-b border-[#23262F] px-4 flex items-center justify-between">
      {/* Left Side */}
      <div className="flex items-center space-x-4">
        {/* Brand */}
        <div className="flex items-center space-x-2">
          <Send className="w-5 h-5 text-[#6366F1]" />
          <span className="font-semibold text-[#F1F1F3] text-sm hidden sm:block">OutBox</span>
        </div>

        <div className="w-px h-5 bg-[#23262F] hidden sm:block"></div>

        {/* BullMQ Dashboard */}
        <a
          href="/admin/queues"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-[#14161C] text-[#8B8D97] hover:text-[#F1F1F3] transition-colors"
        >
          <div className="relative flex items-center justify-center">
            <Activity className="w-4 h-4 text-[#22C55E]" />
            <div className="absolute w-2 h-2 bg-[#22C55E] rounded-full animate-ping opacity-75"></div>
          </div>
          <span className="text-xs font-medium">Queues</span>
        </a>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-3">
        {/* Slack Status Badge */}
        <Link
          to="/settings"
          className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full border border-[#23262F] bg-[#14161C] hover:border-[#6366F1]/50 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#8B8D97]" />
          <span className="text-xs font-medium text-[#8B8D97]">Slack Connected</span>
        </Link>

        {/* Compose Button */}
        <Button
          onClick={onOpenCompose}
          className="bg-[#6366F1] hover:bg-[#4F46E5] text-white h-8 px-3 text-sm font-medium"
        >
          <Send className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Compose</span>
        </Button>

        <div className="w-px h-5 bg-[#23262F]"></div>

        {/* User Area */}
        {user && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-[#14161C] border border-[#23262F] flex items-center justify-center overflow-hidden shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-[#6366F1]">
                    {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-medium text-[#F1F1F3] leading-none">{user.name}</span>
                <span className="text-[10px] text-[#8B8D97] mt-1 leading-none">{user.email}</span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 text-[#8B8D97] hover:text-[#F1F1F3] hover:bg-[#14161C] rounded-md transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
