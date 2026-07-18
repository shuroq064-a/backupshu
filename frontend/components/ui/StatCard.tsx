interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  gradient: string; // Tailwind gradient classes
}

export function StatCard({ icon, label, value, gradient }: StatCardProps) {
  return (
    <div className={`flex-1 rounded-2xl p-4 ${gradient} text-white`}>
      <div className="flex items-center gap-2 mb-2 opacity-90">
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-xs opacity-80 leading-tight">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}