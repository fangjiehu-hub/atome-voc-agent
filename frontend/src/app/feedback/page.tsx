'use client';

import { useEffect, useState } from 'react';
import type { Feedback } from '@/lib/types';
import * as api from '@/lib/api';

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api
      .getFeedback({ page_size: 50 })
      .then((data) => {
        setFeedback(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Feedback Queue</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Human corrections to AI classifications ({total} items)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        {feedback.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No feedback yet. Corrections from the incident detail view will appear here.
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['Type', 'Object ID', 'Field', 'Original', 'Corrected', 'Reason', 'Date'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feedback.map((fb) => (
                <tr key={fb.id} className="hover:bg-gray-50">
                  <td className="px-2.5 py-3 border-b border-gray-100">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px] font-medium">
                      {fb.object_type}
                    </span>
                  </td>
                  <td className="px-2.5 py-3 border-b border-gray-100 font-mono text-xs">#{fb.object_id}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 font-semibold">{fb.field_name}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-gray-500 line-through">{fb.original_value}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-brand-500 font-semibold">{fb.corrected_value}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-gray-600">{fb.reason}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-gray-500 text-xs">
                    {new Date(fb.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
