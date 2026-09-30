import React, { useState, useEffect } from 'react';
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
  Users,
  CheckCircle2,
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

  useEffect(() => {
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

      const res = await api.post('/api/emails/schedule', payload);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#14161C] border border-[#23262F] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#23262F]">
          <h2 className="text-xl font-semibold text-[#F1F1F3]">New Campaign</h2>
          <button
            onClick={onClose}
            className="text-[#8B8D97] hover:text-[#F1F1F3] p-1.5 rounded-lg hover:bg-[#1A1D25] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleScheduleSubmit} className="p-6 space-y-8">
          
          {/* SECTION 1 - FROM */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-[#F1F1F3]">From</label>
            {senders.length === 0 ? (
              <div className="p-4 bg-[#1A1D25] border border-[#23262F] rounded-lg text-sm text-[#8B8D97]">
                No active senders found. A default sender will be used or created automatically.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedSenderId}
                  onChange={(e) => setSelectedSenderId(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-[#1A1D25] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all cursor-pointer"
                  required
                >
                  <option value="" disabled>Select a sender...</option>
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.displayName} ({sender.email})
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#8B8D97]">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2 - RECIPIENTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[#F1F1F3]">Recipients</label>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#8B8D97] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Detected: <strong className="text-[#F1F1F3]">{detectedCount}</strong>
                </span>
                {detectedCount > 0 && (
                  <span className="text-[#22C55E] flex items-center gap-1 font-medium ml-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                  </span>
                )}
              </div>
            </div>

            {csvResult.fileName ? (
              <div className="flex items-center justify-between p-4 bg-[#1A1D25] border border-[#23262F] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#14161C] rounded-md border border-[#23262F]">
                    <FileText className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-[#F1F1F3]">{csvResult.fileName}</p>
                    <p className="text-xs text-[#8B8D97] mt-0.5">
                      {csvResult.totalDetected} total • {csvResult.duplicateCount} duplicates removed
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearCsv}
                  className="text-sm font-medium text-[#EF4444] hover:text-[#EF4444]/80 px-3 py-1.5 rounded-md hover:bg-[#EF4444]/10 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col items-center justify-center p-6 bg-[#1A1D25] border-2 border-dashed border-[#23262F] hover:border-[#6366F1] rounded-lg cursor-pointer transition-colors group">
                  <Upload className="w-6 h-6 text-[#5A5C66] group-hover:text-[#6366F1] mb-2 transition-colors" />
                  <span className="text-sm font-medium text-[#F1F1F3]">Upload CSV</span>
                  <span className="text-xs text-[#8B8D97] mt-1">Auto-detects email columns</span>
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                </label>

                <textarea
                  value={rawRecipientsText}
                  onChange={(e) => setRawRecipientsText(e.target.value)}
                  placeholder="Or paste emails here..."
                  rows={4}
                  className="w-full p-4 bg-[#1A1D25] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm placeholder:text-[#5A5C66] focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 resize-none transition-all"
                />
              </div>
            )}
          </div>

          {/* SECTION 3 - CONTENT */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#F1F1F3] mb-2">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject line..."
                className="w-full px-4 py-3 bg-[#1A1D25] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm placeholder:text-[#5A5C66] focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#F1F1F3] mb-2">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message here..."
                rows={8}
                className="w-full p-4 bg-[#1A1D25] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm placeholder:text-[#5A5C66] focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 resize-none transition-all"
                required
              />
            </div>
          </div>

          {/* SECTION 4 - DELIVERY CONTROLS */}
          <div className="bg-[#1A1D25] border border-[#23262F] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#23262F] flex items-center justify-between bg-[#14161C]/50">
              <h4 className="text-sm font-medium text-[#F1F1F3] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8B8D97]" />
                Delivery Settings
              </h4>
              {detectedCount > 0 && (
                <span className="text-xs text-[#8B8D97]">
                  Est. finish: <strong className="text-[#F1F1F3] font-medium">{calculateEstimatedCompletion()}</strong>
                </span>
              )}
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-medium text-[#8B8D97] mb-1.5">Start Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAtDate}
                  onChange={(e) => setScheduledAtDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#14161C] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8B8D97] mb-1.5">
                  Delay Between Sends (sec)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={minDelaySeconds}
                  onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#14161C] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8B8D97] mb-1.5">Hourly Limit</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#14161C] border border-[#23262F] rounded-lg text-[#F1F1F3] text-sm focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all"
                  required
                />
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="bg-transparent border-[#23262F] text-[#F1F1F3] hover:bg-[#1A1D25]"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              icon={<Sparkles className="w-4 h-4" />}
              className="bg-[#6366F1] hover:bg-[#818CF8] text-white border-none shadow-sm shadow-[#6366F1]/20"
            >
              Schedule {detectedCount > 0 ? `${detectedCount} Emails` : ''}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
