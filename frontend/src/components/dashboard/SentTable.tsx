import React from 'react';
import { Email } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { ExternalLink, CheckCircle2, AlertCircle, Send } from 'lucide-react';

interface SentTableProps {
  emails: Email[];
  loading: boolean;
}

export const SentTable: React.FC<SentTableProps> = ({ emails, loading }) => {
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-[#1A1D25] rounded-lg animate-pulse border border-[#23262F]" />
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A1D25] border border-[#23262F] flex items-center justify-center text-[#8B8D97] mb-4">
          <Send className="w-7 h-7" />
        </div>
        <h3 className="text-base font-medium text-[#F1F1F3]">No sent emails yet</h3>
        <p className="text-sm text-[#8B8D97] max-w-sm mt-2">
          Once your scheduled jobs execute through the worker, sent records and preview links will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-[#F1F1F3]">
        <thead className="bg-[#14161C] text-[#5A5C66] text-xs font-semibold uppercase tracking-wider border-b border-[#23262F]">
          <tr>
            <th className="px-6 py-4 whitespace-nowrap">Recipient</th>
            <th className="px-6 py-4">Subject</th>
            <th className="px-6 py-4 whitespace-nowrap">Sent Timestamp</th>
            <th className="px-6 py-4 whitespace-nowrap">Status</th>
            <th className="px-6 py-4 whitespace-nowrap text-right">Ethereal Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#23262F]">
          {emails.map((email) => {
            const formattedSentDate = email.sentAt
              ? new Date(email.sentAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
              : 'N/A';

            return (
              <tr key={email.id} className="hover:bg-[#1A1D25] transition-colors group">
                <td className="px-6 py-4 text-[#F1F1F3] whitespace-nowrap">
                  <span className="font-mono text-sm">{email.recipient}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="max-w-md truncate text-[#F1F1F3] font-medium" title={email.subject}>
                    {email.subject}
                  </div>
                  {email.failureReason && (
                    <div className="flex items-center gap-1.5 text-xs text-[#EF4444] mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate" title={email.failureReason}>
                        {email.failureReason}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-[#8B8D97] whitespace-nowrap">
                  <span className="text-sm">{formattedSentDate}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={email.status} />
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {email.status === 'SENT' ? (
                    <a
                      href={email.providerMessageId && email.providerMessageId.startsWith('http') ? email.providerMessageId : 'https://ethereal.email/messages'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8B8D97] hover:text-[#6366F1] transition-colors"
                      title="Open Ethereal Mail Inbox Preview"
                    >
                      <span>Preview</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-[#5A5C66] text-sm">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
