import React from 'react';
import { Email } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { Calendar, User, Clock, Inbox } from 'lucide-react';

interface ScheduledTableProps {
  emails: Email[];
  loading: boolean;
}

export const ScheduledTable: React.FC<ScheduledTableProps> = ({ emails, loading }) => {
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
          <Inbox className="w-7 h-7" />
        </div>
        <h3 className="text-base font-medium text-[#F1F1F3]">No scheduled emails</h3>
        <p className="text-sm text-[#8B8D97] max-w-sm mt-2">
          Click "Compose Email" to upload contacts and schedule delayed outreach sequences.
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
            <th className="px-6 py-4 whitespace-nowrap">Scheduled Send Time</th>
            <th className="px-6 py-4 whitespace-nowrap">Sender</th>
            <th className="px-6 py-4 whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#23262F]">
          {emails.map((email) => {
            const formattedDate = new Date(email.scheduledAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <tr key={email.id} className="hover:bg-[#1A1D25] transition-colors group">
                <td className="px-6 py-4 text-[#F1F1F3] whitespace-nowrap">
                  <span className="font-mono text-sm">{email.recipient}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="max-w-md truncate text-[#F1F1F3] font-medium" title={email.subject}>
                    {email.subject}
                  </div>
                  <div className="max-w-md truncate text-xs text-[#8B8D97] mt-0.5" title={email.body}>
                    {email.body}
                  </div>
                </td>
                <td className="px-6 py-4 text-[#8B8D97] whitespace-nowrap">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-[#5A5C66]" />
                    <span>{formattedDate}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-[#8B8D97] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#5A5C66]" />
                    <span>{email.sender?.email || 'Default Sender'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={email.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
