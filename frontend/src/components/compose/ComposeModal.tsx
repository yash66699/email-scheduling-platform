import React, { useState } from 'react';
import { useCsvParser } from '../../hooks/useCsvParser';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import { ScheduleEmailPayload } from '../../types';
import { toast } from 'sonner';
import {
  X,
  Upload,
  FileText,
  Clock,
  Zap,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { parseFile, clearCsv, result: csvResult, parsing } = useCsvParser();
  const { user } = useAuth();
  const senders = user?.senders || [];

  const [selectedSenderId, setSelectedSenderId] = useState<string>('');

  React.useEffect(() => {
    if (senders.length === 0) {
      if (selectedSenderId) setSelectedSenderId('');
      return;
    }

    // If no sender selected, or the selected sender is no longer in the list
    const isSelectedValid = senders.some((s) => s.id === selectedSenderId);
    if (!selectedSenderId || !isSelectedValid) {
      const defaultSender = senders.find((s) => s.isActive) || senders[0];
      setSelectedSenderId(defaultSender.id);
    }
  }, [senders, selectedSenderId]);

  const [rawRecipientsText, setRawRecipientsText] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAtDate, setScheduledAtDate] = useState(() => {
    const now = new Date();
    // Default start time: 2 minutes in the future
    now.setMinutes(now.getMinutes() + 2);
    return now.toISOString().slice(0, 16); // format YYYY-MM-THH:mm
  });
  const [minDelaySeconds, setMinDelaySeconds] = useState(2); // Default 2s delay
  const [hourlyLimit, setHourlyLimit] = useState(100); // Default 100/hr
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  // Determine final list of recipient emails
  const getFinalRecipients = (): string[] => {
    if (csvResult.validEmails.length > 0) {
      return csvResult.validEmails;
    }
    const manualEmails = rawRecipientsText
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return Array.from(new Set(manualEmails));
  };

  const finalRecipients = getFinalRecipients();
  const detectedCount = finalRecipients.length;

  // Calculate estimated completion time
  const calculateEstimatedCompletion = () => {
    if (detectedCount === 0) return null;
    const startMs = new Date(scheduledAtDate).getTime();
    const totalDurationMs = detectedCount * (minDelaySeconds * 1000);
    const endMs = startMs + totalDurationMs;
    return new Date(endMs).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseFile(e.target.files[0]);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (detectedCount === 0) {
      toast.error('Please upload a CSV or enter at least one valid recipient email address.');
      return;
    }

    if (senders.length > 0 && !selectedSenderId) {
      toast.error('Please select a sender.');
      return;
    }

    if (!subject.trim()) {
      toast.error('Email subject is required.');
      return;
    }

    if (!body.trim()) {
      toast.error('Email body is required.');
      return;
    }

    setSubmitting(true);

    try {
      const payload: ScheduleEmailPayload = {
        recipients: finalRecipients,
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt: new Date(scheduledAtDate).toISOString(),
        senderId: selectedSenderId || undefined,
        maxEmailsPerHour: Number(hourlyLimit),
        minDelayMsBetweenSend: Number(minDelaySeconds) * 1000,
      };

      const res = await api.post('/emails/schedule', payload);

      toast.success(
        `Successfully scheduled ${res.data.count} emails! First send queued for ${new Date(
          res.data.firstScheduledAt
        ).toLocaleTimeString()}`
      );

      onSuccess();
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to schedule emails';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#151D2A] border border-[#232E42] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232E42] bg-[#0B0F17]/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#8B1E2D]/20 text-[#F4D35E] flex items-center justify-center border border-[#8B1E2D]/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Compose & Schedule Sequence</h2>
              <p className="text-xs text-slate-400">Configure BullMQ delayed queueing and rate limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleScheduleSubmit} className="p-6 space-y-5 text-xs">
          {/* Sender Selection */}
          <div className="space-y-2">
            <label className="block font-medium text-slate-300">
              Sender Account
            </label>
            {senders.length === 0 ? (
              <div className="p-3 bg-[#151D2A] border border-[#232E42] rounded-xl text-slate-400">
                No active senders found. A default sender will be used or created automatically.
              </div>
            ) : (
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-[#232E42] rounded-xl text-slate-200 focus:outline-none focus:border-[#8B1E2D] focus:ring-1 focus:ring-[#8B1E2D]"
                required
              >
                <option value="" disabled>Select a sender...</option>
                {senders.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.displayName} ({sender.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File Lead Upload Section */}
          <div className="space-y-2">
            <label className="block font-medium text-slate-300">
              1. Lead Recipients (CSV / Text Upload or Manual List)
            </label>

            {csvResult.fileName ? (
              <div className="flex items-center justify-between p-3 bg-[#8B1E2D]/10 border border-[#8B1E2D]/30 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-[#E63946]" />
                  <div>
                    <p className="font-medium text-slate-200">{csvResult.fileName}</p>
                    <p className="text-[11px] text-[#F4D35E]">
                      Detected <strong className="text-white">{csvResult.totalDetected}</strong> valid email addresses
                      {csvResult.duplicateCount > 0 && ` (${csvResult.duplicateCount} duplicates removed)`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearCsv}
                  className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1 bg-slate-900 rounded border border-slate-800"
                >
                  Remove CSV
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center p-4 bg-slate-900/60 border border-dashed border-slate-700 hover:border-[#8B1E2D]/50 rounded-xl cursor-pointer transition-colors group">
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-[#F4D35E] mb-1" />
                  <span className="font-medium text-slate-300 group-hover:text-white">Upload CSV / Text File</span>
                  <span className="text-[10px] text-slate-500">Auto-detects emails</span>
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                </label>

                <textarea
                  value={rawRecipientsText}
                  onChange={(e) => setRawRecipientsText(e.target.value)}
                  placeholder="Or paste email addresses separated by commas or line breaks..."
                  rows={3}
                  className="w-full p-3 bg-[#0B0F17] border border-[#232E42] rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#8B1E2D] focus:ring-1 focus:ring-[#8B1E2D] resize-none font-mono"
                />
              </div>
            )}

            {/* Detected Count Badge */}
            <div className="flex items-center justify-between px-1 text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#8B1E2D]" />
                Detected Recipients: <strong className="text-[#F4D35E] font-bold">{detectedCount}</strong>
              </span>
              {detectedCount > 0 && (
                <span className="text-[#66BB6A] flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Valid & Cleaned
                </span>
              )}
            </div>
          </div>

          {/* Subject & Body */}
          <div className="space-y-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">2. Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Scaling outreach throughput with automated deliverability..."
                className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-[#232E42] rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#8B1E2D] focus:ring-1 focus:ring-[#8B1E2D]"
                required
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">3. Email Message Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{Name}},\n\nI noticed your team is looking for a robust cold email infrastructure..."
                rows={4}
                className="w-full p-3.5 bg-[#0B0F17] border border-[#232E42] rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#8B1E2D] focus:ring-1 focus:ring-[#8B1E2D] resize-none"
                required
              />
            </div>
          </div>

          {/* Scheduling Controls & Throttling Parameters */}
          <div className="p-4 bg-[#0B0F17] border border-[#232E42] rounded-xl space-y-4">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5 border-b border-[#232E42] pb-2">
              <Clock className="w-4 h-4 text-[#F4D35E]" />
              4. Execution Schedule & Rate Limits
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAtDate}
                  onChange={(e) => setScheduledAtDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#151D2A] border border-[#232E42] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Delay Between Sends (sec)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={minDelaySeconds}
                  onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-[#151D2A] border border-[#232E42] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Hourly Sender Limit</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-[#151D2A] border border-[#232E42] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Estimated Completion Time Banner */}
            {detectedCount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Estimated Completion:
                </span>
                <span className="font-mono font-semibold text-slate-200">
                  {calculateEstimatedCompletion()}
                </span>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              icon={<Sparkles className="w-4 h-4" />}
            >
              Schedule {detectedCount > 0 ? `${detectedCount} Emails` : 'Sequence'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
