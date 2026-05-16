interface SubIssueTagProps {
  tag: string;
}

export default function SubIssueTag({ tag }: SubIssueTagProps) {
  return (
    <span className="inline-block bg-[#f0ff5f]/15 text-brand-500 border border-[#f0ff5f]/30 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide">
      {tag.replace(/_/g, ' ')}
    </span>
  );
}
