import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Textarea } from '../components/ui/textarea';

export default function DescriptionAutocomplete({ value, onChange }) {
  const { api } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => { setLocalValue(value || ''); }, [value]);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await api().get(`/transactions/descriptions/suggestions?q=${encodeURIComponent(q)}`);
      setSuggestions(res.data || []);
    } catch { setSuggestions([]); }
  }, [api]);

  const handleChange = (e) => {
    const v = e.target.value;
    setLocalValue(v);
    onChange(v);
    fetchSuggestions(v);
    setShowSuggestions(true);
  };

  const selectSuggestion = (desc) => {
    setLocalValue(desc);
    onChange(desc);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Textarea
        placeholder="Комментарий к операции..."
        value={localValue}
        onChange={handleChange}
        onFocus={() => localValue.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        data-testid="form-description"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[160px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted truncate"
              onMouseDown={() => selectSuggestion(s.description)}
              data-testid={`suggestion-${i}`}>
              {s.description}
              <span className="text-muted-foreground ml-2">({s.count})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
