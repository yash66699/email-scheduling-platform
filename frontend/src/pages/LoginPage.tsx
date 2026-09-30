import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Send, Clock, Shield, Layers, MessageSquare } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { user, loginGoogle, loginDemo, loading } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0C0E12] flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#6366F1]/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-[#14161C] border border-[#23262F] rounded-2xl p-8 shadow-2xl shadow-black/50 relative z-10 space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0C0E12] border border-[#23262F] shadow-sm mb-2">
            <Send className="w-6 h-6 text-[#6366F1]" />
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#F1F1F3]">OutBox</h1>
            <p className="text-sm text-[#8B8D97] mt-2">
              Outbound email infrastructure
            </p>
          </div>
        </div>

        {/* Login Options */}
        <div className="space-y-4 pt-4">
          <button
            onClick={loginGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-slate-900 hover:bg-slate-50 font-medium text-sm rounded-lg transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center py-2">
            <div className="border-t border-[#23262F] w-full" />
            <span className="bg-[#14161C] px-4 text-xs text-[#5A5C66] lowercase shrink-0">
              or
            </span>
          </div>

          <Button
            variant="outline"
            size="lg"
            onClick={loginDemo}
            loading={loading}
            className="w-full font-medium text-sm py-3 bg-transparent hover:bg-[#23262F]/50 text-[#F1F1F3] border border-[#23262F]"
          >
            Try Demo Account
          </Button>
        </div>

        {/* Feature Highlights */}
        <div className="pt-6 border-t border-[#23262F] grid grid-cols-2 gap-y-4 gap-x-2 text-xs text-[#8B8D97]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#6366F1] shrink-0" />
            <span>Scheduled Delivery</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span>Rate Limiting</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#6366F1] shrink-0" />
            <span>Queue Processing</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span>Slack Alerts</span>
          </div>
        </div>
      </div>
    </div>
  );
};
