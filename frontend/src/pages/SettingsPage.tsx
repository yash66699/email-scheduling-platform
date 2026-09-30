import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, CheckCircle2, AlertTriangle, ShieldCheck, Zap, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '../components/layout/Header';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const { user, refetchUser } = useAuth();
  const navigate = useNavigate();

  const handleDisconnectSlack = async () => {
    try {
      await api.post('/slack/disconnect');
      toast.success('Slack disconnected successfully');
      await refetchUser();
    } catch (error) {
      toast.error('Failed to disconnect Slack');
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0E12] text-[#F1F1F3] font-sans selection:bg-[#6366F1]/30">
      <Header onOpenCompose={() => navigate('/')} />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#8B8D97] hover:text-[#F1F1F3] transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>

        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Settings</h1>
          <p className="text-[#8B8D97]">Manage your integrations and account preferences.</p>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#6366F1]" />
              Integrations
            </h2>

            <div className="bg-[#14161C] border border-[#23262F] rounded-xl overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1A1D25] border border-[#23262F] flex items-center justify-center shrink-0">
                      <Hash className="w-6 h-6 text-[#F1F1F3]" />
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-medium">Slack</h3>
                        {user?.slackConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1A1D25] text-[#8B8D97] border border-[#23262F]">
                            Not Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[#8B8D97] text-sm leading-relaxed max-w-md">
                        Connect your Slack workspace to receive instant notifications about your email campaigns and schedule statuses.
                      </p>
                    </div>
                  </div>

                  <div>
                    {user?.slackConnected ? (
                      <Button 
                        onClick={handleDisconnectSlack}
                        variant="secondary"
                        className="bg-[#1A1D25] hover:bg-[#23262F] text-[#F1F1F3] border-[#23262F]"
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <a 
                        href="/api/slack/connect"
                        className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white font-medium text-sm transition-colors"
                      >
                        Connect Slack
                      </a>
                    )}
                  </div>
                </div>

                {user?.slackConnected && (
                  <div className="mt-6 pt-6 border-t border-[#23262F]">
                    <div className="bg-[#1A1D25] rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <ShieldCheck className="w-5 h-5 text-[#8B8D97]" />
                        <div>
                          <p className="text-sm font-medium text-[#F1F1F3]">{user.slackIntegration?.slackTeamName || 'Unknown Workspace'}</p>
                          <p className="text-xs text-[#8B8D97]">Workspace connected</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#8B8D97]">
                        <Hash className="w-4 h-4" />
                        <span>{user.slackIntegration?.channelName || 'general'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
