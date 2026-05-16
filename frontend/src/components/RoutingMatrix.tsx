'use client';

import { CATEGORIES } from '@/lib/constants';

interface RoutingRule {
  id: number;
  category: string;
  severity_min: string;
  primary_owner: string;
  departments: string[];
  escalate_to: string[] | null;
  channels: string[];
  is_active: boolean;
}

interface RoutingMatrixProps {
  rules: RoutingRule[];
}

export default function RoutingMatrix({ rules }: RoutingMatrixProps) {
  const getCategoryLabel = (key: string) => {
    const cat = CATEGORIES.find((c) => c.key === key);
    return cat?.label || key.replace(/_/g, ' ');
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
          Category → Owner & Stakeholders
        </h4>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                Category
              </th>
              <th className="text-left px-2 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                Primary Owner
              </th>
              <th className="text-left px-2 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                Secondary
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-2 py-2 border-b border-gray-100 font-semibold text-gray-800">
                  {getCategoryLabel(rule.category)}
                </td>
                <td className="px-2 py-2 border-b border-gray-100">
                  <span className="inline-block bg-[#f0ff5f]/20 text-brand-500 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                    {rule.primary_owner || '-'}
                  </span>
                </td>
                <td className="px-2 py-2 border-b border-gray-100 text-gray-500 text-[11.5px]">
                  {rule.departments.join(', ') || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
          Critical Escalation Path
        </h4>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                Category
              </th>
              <th className="text-left px-2 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                Escalate To (on Critical)
              </th>
            </tr>
          </thead>
          <tbody>
            {rules
              .filter((r) => r.escalate_to && r.escalate_to.length > 0)
              .map((rule) => (
                <tr key={rule.id}>
                  <td className="px-2 py-2 border-b border-gray-100 font-semibold text-gray-800">
                    {getCategoryLabel(rule.category)}
                  </td>
                  <td className="px-2 py-2 border-b border-gray-100">
                    <span className="text-coral font-semibold">
                      {rule.escalate_to?.join(', ')}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
