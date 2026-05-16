import { CATEGORIES } from '@/lib/constants';

interface CategoryTagProps {
  category: string;
}

export default function CategoryTag({ category }: CategoryTagProps) {
  const cat = CATEGORIES.find((c) => c.key === category);
  const label = cat?.label || category.replace(/_/g, ' ');

  return (
    <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px] font-medium">
      {label}
    </span>
  );
}
