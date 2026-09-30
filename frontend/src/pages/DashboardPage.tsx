import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { ScheduledTable } from '../components/dashboard/ScheduledTable';
import { SentTable } from '../components/dashboard/SentTable';
import { SearchBar } from '../components/dashboard/SearchBar';
import { ComposeModal } from '../components/compose/ComposeModal';
import { Email, PaginatedResponse } from '../types';
import { useAuth } from '../hooks/useAuth';
import {
  Clock,
  Send,
  Calendar,
  Layers,
  Zap,
  Activity,
  Plus,
  RefreshCw,
  Hash,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // 1. Fetch Scheduled Emails (Auto-poll every 3 seconds for live worker updates)
  const {
    data: scheduledData,
    isLoading: loadingScheduled,
    refetch: refetchScheduled,
  } = useQuery<PaginatedResponse<Email>>({
    queryKey: ['scheduled-emails', page],
    queryFn: async () => {
      const res = await api.get(`/api/emails/scheduled?page=${page}&limit=10`);
      return res.data;
    },
    refetchInterval: 3000,
  });

  // 2. Fetch Sent Emails (Auto-poll every 3 seconds)
  const {
    data: sentData,
    isLoading: loadingSent,
    refetch: refetchSent,
  } = useQuery<PaginatedResponse<Email>>({
    queryKey: ['sent-emails', page],
    queryFn: async () => {
      const res = await api.get(`/api/emails/sent?page=${page}&limit=10`);
      return res.data;
    },
    refetchInterval: 3000,
  });

  // 3. Search Emails via Elasticsearch / DB Fallback
  const { data: searchData, isLoading: loadingSearch } = useQuery<PaginatedResponse<Email>>({
    queryKey: ['search-emails', searchQuery, page],
    queryFn: async () => {
      if (!searchQuery.trim()) return null as any;
      const res = await api.get(`/api/emails/search?q=${encodeURIComponent(searchQuery)}&page=${page}&limit=10`);
      return res.data;
    },
    enabled: searchQuery.trim().length > 0,
  });

  const handleComposeSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
    queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
  };

  const isSearching = searchQuery.trim().length > 0;
  const currentItems = isSearching
    ? searchData?.items || []
    : activeTab === 'scheduled'
      ? scheduledData?.items || []
      : sentData?.items || [];

  const totalCount = isSearching
    ? searchData?.total || 0
    : activeTab === 'scheduled'
      ? scheduledData?.total || 0
      : sentData?.total || 0;

  const totalPages = isSearching
    ? searchData?.totalPages || 1
    : activeTab === 'scheduled'
      ? scheduledData?.totalPages || 1
      : sentData?.totalPages || 1;

  const activeSender = user?.senders?.[0];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#0C0E12] flex flex-col font-sans text-[#F1F1F3]">
      <Header onOpenCompose={() => setIsComposeOpen(true)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Contextual Greeting Area */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-[#8B8D97] mt-1 text-sm">{formattedDate}</p>
          </div>
          <Button 
            onClick={() => setIsComposeOpen(true)}
            className="bg-[#6366F1] hover:bg-[#818CF8] text-white border-none shadow-sm flex items-center gap-2 px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            Compose Email
          </Button>
        </div>

        {/* Slack Disconnected Banner */}
        {!user?.slackConnected && (
          <div className="px-4 py-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />
              <div className="text-[#F1F1F3]">
                <strong className="font-medium">Slack Notifications Disconnected</strong>
                <span className="text-[#8B8D97] ml-2 hidden sm:inline">Connect your workspace to receive real-time alerts when hourly rate limits are hit.</span>
              </div>
            </div>
            <a
              href="/api/slack/connect"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] border border-[#F59E0B]/30 font-medium shrink-0 transition-colors text-xs"
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Connect Slack</span>
            </a>
          </div>
        )}

        {/* Metrics Row (Single horizontal strip) */}
        <div className="bg-[#14161C] border border-[#23262F] rounded-xl p-6">
          <div className="flex flex-wrap md:flex-nowrap divide-y md:divide-y-0 md:divide-x divide-[#23262F] -mx-6">
            <div className="w-full md:w-1/4 px-6 py-4 md:py-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-[#8B8D97] mb-2">
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-xs uppercase tracking-wider font-semibold">Scheduled Queue</span>
              </div>
              <div className="text-3xl font-light text-[#F1F1F3]">
                {scheduledData?.total || 0}
              </div>
            </div>
            <div className="w-full md:w-1/4 px-6 py-4 md:py-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-[#8B8D97] mb-2">
                <Send className="w-4 h-4 text-[#22C55E]" />
                <span className="text-xs uppercase tracking-wider font-semibold">Total Delivered</span>
              </div>
              <div className="text-3xl font-light text-[#F1F1F3]">
                {sentData?.total || 0}
              </div>
            </div>
            <div className="w-full md:w-1/4 px-6 py-4 md:py-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-[#8B8D97] mb-2">
                <Zap className="w-4 h-4 text-[#EF4444]" />
                <span className="text-xs uppercase tracking-wider font-semibold">Hourly Limit</span>
              </div>
              <div className="text-3xl font-light text-[#F1F1F3]">
                {activeSender?.maxEmailsPerHour || 100}
              </div>
            </div>
            <div className="w-full md:w-1/4 px-6 py-4 md:py-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-[#8B8D97] mb-2">
                <Activity className="w-4 h-4 text-[#6366F1]" />
                <span className="text-xs uppercase tracking-wider font-semibold">Worker Concurrency</span>
              </div>
              <div className="text-3xl font-light text-[#F1F1F3]">
                10
              </div>
            </div>
          </div>
        </div>

        {/* Main Data Area */}
        <div className="bg-[#14161C] border border-[#23262F] rounded-xl shadow-sm overflow-hidden">
          {/* Tab Bar & Search */}
          <div className="border-b border-[#23262F] flex flex-col md:flex-row items-center justify-between px-6 bg-[#14161C]">
            {/* Tabs */}
            <div className="flex items-center space-x-6 w-full md:w-auto">
              <button
                onClick={() => {
                  setActiveTab('scheduled');
                  setPage(1);
                }}
                className={`py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'scheduled' && !isSearching
                    ? 'border-[#6366F1] text-[#F1F1F3]'
                    : 'border-transparent text-[#8B8D97] hover:text-[#F1F1F3] hover:border-[#23262F]'
                }`}
              >
                Scheduled
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-[#1A1D25] text-[#8B8D97]">
                  {scheduledData?.total || 0}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('sent');
                  setPage(1);
                }}
                className={`py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'sent' && !isSearching
                    ? 'border-[#6366F1] text-[#F1F1F3]'
                    : 'border-transparent text-[#8B8D97] hover:text-[#F1F1F3] hover:border-[#23262F]'
                }`}
              >
                Sent
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-[#1A1D25] text-[#8B8D97]">
                  {sentData?.total || 0}
                </span>
              </button>
            </div>

            {/* Search */}
            <div className="w-full md:w-auto py-3 md:py-0">
              <SearchBar
                query={searchQuery}
                onQueryChange={(q) => {
                  setSearchQuery(q);
                  setPage(1);
                }}
                searchSource={searchData?.source}
                isSearching={loadingSearch}
              />
            </div>
          </div>

          {/* Table Render */}
          {isSearching ? (
            activeTab === 'scheduled' ? (
              <ScheduledTable emails={currentItems} loading={loadingSearch} />
            ) : (
              <SentTable emails={currentItems} loading={loadingSearch} />
            )
          ) : activeTab === 'scheduled' ? (
            <ScheduledTable emails={scheduledData?.items || []} loading={loadingScheduled} />
          ) : (
            <SentTable emails={sentData?.items || []} loading={loadingSent} />
          )}

          {/* Pagination Footer */}
          <div className="px-6 py-4 border-t border-[#23262F] flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#8B8D97] bg-[#14161C]">
            <span>
              Showing <strong className="text-[#F1F1F3]">{page}</strong> of{' '}
              <strong className="text-[#F1F1F3]">{totalPages}</strong> pages ({totalCount} items)
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border-[#23262F] text-[#F1F1F3] hover:bg-[#1A1D25] bg-transparent disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="border-[#23262F] text-[#F1F1F3] hover:bg-[#1A1D25] bg-transparent disabled:opacity-50"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={handleComposeSuccess}
      />
    </div>
  );
};
