interface LabSignalBadgeProps {
  readonly value: number;
  readonly label: string;
}

export const LabSignalBadge = ({ value, label }: LabSignalBadgeProps) => {
  const status = value >= 80 ? 'good' : value >= 60 ? 'warn' : 'critical';
  return (
    <div className={`lab-signal-badge ${status}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
};
