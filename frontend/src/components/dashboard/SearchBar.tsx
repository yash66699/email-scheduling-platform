import React from 'react';
import { Search, Database, Zap, X } from 'lucide-react';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  searchSource?: 'elasticsearch' | 'postgresql';
  isSearching: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  searchSource,
  isSearching,
}) => {
  return (
    <div className="relative flex items-center w-full max-w-xs md:max-w-sm">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5C66]">
        <Search className="w-4 h-4" />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search emails..."
        className="w-full pl-9 pr-24 py-2 bg-[#1A1D25] border border-[#23262F] rounded-lg text-sm text-[#F1F1F3] placeholder:text-[#5A5C66] focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] transition-all"
      />

      {query && (
        <button
          onClick={() => onQueryChange('')}
          className="absolute right-20 text-[#8B8D97] hover:text-[#F1F1F3] p-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {query && searchSource && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded bg-[#0C0E12] border border-[#23262F]">
          {searchSource === 'elasticsearch' ? (
            <>
              <Zap className="w-3 h-3 text-[#F59E0B]" />
              <span className="text-[#F59E0B] font-medium uppercase">ES</span>
            </>
          ) : (
            <>
              <Database className="w-3 h-3 text-[#6366F1]" />
              <span className="text-[#6366F1] font-medium uppercase">PG</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
