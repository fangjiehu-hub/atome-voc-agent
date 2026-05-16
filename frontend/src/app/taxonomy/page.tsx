'use client';

import { useEffect, useState } from 'react';
import { CATEGORIES, SUB_ISSUES } from '@/lib/constants';
import * as api from '@/lib/api';

interface TaxCategory {
  id: number;
  key: string;
  label: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

interface TaxSubIssue {
  id: number;
  key: string;
  label: string;
  category_key: string | null;
  description: string | null;
  is_active: boolean;
}

export default function TaxonomyPage() {
  const [categories, setCategories] = useState<TaxCategory[]>([]);
  const [subIssues, setSubIssues] = useState<TaxSubIssue[]>([]);

  useEffect(() => {
    Promise.all([api.getTaxonomyCategories(), api.getTaxonomySubIssues()])
      .then(([cats, subs]) => {
        setCategories(cats);
        setSubIssues(subs);
      })
      .catch(() => {
        // Show static config from constants
        setCategories(
          CATEGORIES.map((c, i) => ({
            id: i + 1, key: c.key, label: c.label, description: null,
            color: c.color, sort_order: i, is_active: true,
          }))
        );
        setSubIssues(
          SUB_ISSUES.map((s, i) => ({
            id: i + 1, key: s, label: s.replace(/_/g, ' '),
            category_key: null, description: null, is_active: true,
          }))
        );
      });
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Taxonomy</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Manage complaint categories and sub-issue tags
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Categories */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3.5">
            Categories ({categories.length})
          </h3>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-lg"
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: cat.color || '#9CA3AF' }}
                />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-gray-900">{cat.label}</div>
                  <div className="text-[11px] text-gray-500 font-mono">{cat.key}</div>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    cat.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {cat.is_active ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sub-Issues */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3.5">
            Sub-Issue Tags ({subIssues.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {subIssues.map((si) => (
              <span
                key={si.id}
                className="inline-block bg-[#f0ff5f]/15 text-brand-500 border border-[#f0ff5f]/30 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              >
                {si.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
