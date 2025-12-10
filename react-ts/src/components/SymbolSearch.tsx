// src/components/SymbolSearch.tsx
import React, { useEffect, useState, useRef } from "react";
import { searchSymbols, type SymbolItem } from "../api";

interface SymbolSearchProps {
  value: string;
  onChange: (value: string) => void;      // update input text
  onSelect: (value: string) => void;      // when user clicks a suggestion
}

const SymbolSearch: React.FC<SymbolSearchProps> = ({
  value,
  onChange,
  onSelect,
}) => {
  const [query, setQuery] = useState<string>(value || "");
  const [suggestions, setSuggestions] = useState<SymbolItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchSymbols(query);
        setSuggestions(res);
        setOpen(true);
      } catch (err) {
        console.error("Symbol search error", err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(handle);
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val); // update parent state
  };

  const handleSelect = (item: SymbolItem) => {
    const sym = item.symbol;
    setQuery(sym);
    onChange(sym);
    onSelect(sym);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-xs"
      style={{ position: "relative" }}
    >
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        className="border px-2 py-1 rounded w-full"
        placeholder="Search symbol…"
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />

      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          …
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-gray-600 bg-slate-900 text-sm shadow-lg"
          style={{ listStyle: "none", paddingLeft: 0 }}
        >
          {suggestions.map((item) => (
            <li
              key={item.id}
              className="cursor-pointer px-3 py-2 hover:bg-slate-800"
              onClick={() => handleSelect(item)}
            >
              <div className="font-medium text-slate-100">{item.symbol}</div>
              {item.company_name && (
                <div className="text-xs text-slate-400">
                  {item.company_name}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && !loading && suggestions.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full rounded border border-gray-600 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          No symbols found
        </div>
      )}
    </div>
  );
};

export default SymbolSearch;
